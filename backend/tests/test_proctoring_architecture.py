"""
Senior Engineering Automated Test Suite: Sentinel Proctoring Architecture
Validates:
1. Layer A: Local Real-Time Computer Vision Detection (~10ms)
2. Layer B: Temporal Event Smoothing & Cooldowns
3. Layer C: VLM Provider Abstraction, Timeouts, Quota Errors & Graceful Degradation
4. Event Normalization & Idempotency
5. Fairness Constraints (Brief glance vs Sustained Absence)
"""

import time
import base64
import numpy as np
import cv2
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.seed import DEMO_EXAM_ID
from app.vision.local_detector import detect_faces_local
from app.vision.temporal_tracker import TemporalEventTracker, TemporalTrackerConfig
from app.vision.vlm_service import (
    VLMAnalysisRequest,
    VLMAnalysisResult,
    GeminiVisionProvider,
    GroqVisionProvider,
    VLMIncidentReviewService
)


# Helper: Generate synthetic test image
def make_test_image_b64(width=640, height=480, draw_face_circle=False) -> str:
    img = np.ones((height, width, 3), dtype=np.uint8) * 120
    if draw_face_circle:
        # Approximate face circle
        cv2.circle(img, (width // 2, height // 2), 60, (220, 220, 220), -1)
        # Eye points
        cv2.circle(img, (width // 2 - 25, height // 2 - 15), 6, (30, 30, 30), -1)
        cv2.circle(img, (width // 2 + 25, height // 2 - 15), 6, (30, 30, 30), -1)
        # Mouth line
        cv2.line(img, (width // 2 - 20, height // 2 + 25), (width // 2 + 20, height // 2 + 25), (30, 30, 30), 3)
    else:
        # Ambient room lighting gradient & subtle structural background (sigma > 10, laplacian > 30)
        for y in range(height):
            img[y, :, :] = np.clip(img[y, :, :] + int((y / height) * 40 - 20), 0, 255)
        img[::40, :, :] = np.clip(img[::40, :, :] + 15, 0, 255)
        img[:, ::40, :] = np.clip(img[:, ::40, :] - 15, 0, 255)

    _, buf = cv2.imencode('.jpg', img)
    return base64.b64encode(buf.tobytes()).decode('ascii')


# ==============================================================================
# 1. LAYER A TESTS: Local Computer Vision Detector
# ==============================================================================

def test_local_detector_face_absent():
    """Verify local detector immediately recognizes absence of human face."""
    blank_b64 = make_test_image_b64(width=320, height=240, draw_face_circle=False)
    result = detect_faces_local(blank_b64)
    assert result["face_detected"] is False
    assert result["face_count"] == 0
    assert result["status"] == "no_face"
    assert result["latency_ms"] < 250  # Must be fast local CPU inference


def test_local_detector_malformed_corrupt_payload():
    """Verify corrupted or invalid image payloads are handled without crashing."""
    corrupt_b64 = "THIS_IS_NOT_A_VALID_BASE64_IMAGE!!!"
    result = detect_faces_local(corrupt_b64)
    assert result["face_detected"] is False
    assert result["status"] == "unusable_frame"
    assert "error_detail" in result


def test_local_detector_subminimal_dimensions():
    """Verify frames smaller than 50x50 are rejected as unusable."""
    tiny_b64 = make_test_image_b64(width=30, height=30)
    result = detect_faces_local(tiny_b64)
    assert result["face_detected"] is False
    assert result["status"] == "no_face"
    assert result.get("frame_quality") == "unusable_dimensions"


# ==============================================================================
# 2. LAYER B TESTS: Temporal Event Smoothing & Cooldowns
# ==============================================================================

def test_temporal_tracker_brief_absence_no_violation():
    """
    Fairness guarantee: A brief face disappearance (< 4.0s) must NOT emit a violation.
    """
    tracker = TemporalEventTracker(config=TemporalTrackerConfig(sustained_face_absence_sec=4.0))
    no_face = {"status": "no_face", "face_count": 0, "confidence": 0.95}

    # Frame 1 at t=0s
    events_t0 = tracker.evaluate_frame("test_sess", no_face, current_time=100.0)
    assert len(events_t0) == 0

    # Frame 2 at t=2.5s (transient absence)
    events_t2 = tracker.evaluate_frame("test_sess", no_face, current_time=102.5)
    assert len(events_t2) == 0

    # Face returns at t=3.0s
    verified_face = {"status": "verified", "face_count": 1, "looking_at_screen": True, "confidence": 0.98}
    events_t3 = tracker.evaluate_frame("test_sess", verified_face, current_time=103.0)
    assert len(events_t3) == 0


def test_temporal_tracker_sustained_absence_triggers_event():
    """
    Sustained anomaly: Face continuously absent for >= 4.0s MUST emit a normalized incident.
    """
    tracker = TemporalEventTracker(config=TemporalTrackerConfig(sustained_face_absence_sec=4.0, cooldown_interval_sec=8.0))
    no_face = {"status": "no_face", "face_count": 0, "confidence": 0.95}

    tracker.evaluate_frame("test_sess", no_face, current_time=200.0)
    tracker.evaluate_frame("test_sess", no_face, current_time=202.0)
    events = tracker.evaluate_frame("test_sess", no_face, current_time=204.2)

    assert len(events) == 1
    ev = events[0]
    assert ev["event_type"] == "FACE_ABSENT_SUSTAINED"
    assert ev["severity"] == "high"
    assert ev["duration_ms"] >= 4000
    assert ev["status"] == "observed"


def test_temporal_tracker_cooldown_prevents_duplicate_spam():
    """
    Cooldown guarantee: Once an incident is emitted, identical events are suppressed during cooldown.
    """
    tracker = TemporalEventTracker(config=TemporalTrackerConfig(sustained_face_absence_sec=4.0, cooldown_interval_sec=8.0))
    no_face = {"status": "no_face", "face_count": 0, "confidence": 0.95}

    tracker.evaluate_frame("test_sess", no_face, current_time=300.0)
    e1 = tracker.evaluate_frame("test_sess", no_face, current_time=304.5)
    assert len(e1) == 1

    # Next frame 1 second later (at t=305.5s, within 8.0s cooldown): should emit 0 events
    e2 = tracker.evaluate_frame("test_sess", no_face, current_time=305.5)
    assert len(e2) == 0

    # After cooldown expires (at t=313.0s): can emit again
    e3 = tracker.evaluate_frame("test_sess", no_face, current_time=313.0)
    assert len(e3) == 1


def test_temporal_tracker_sustained_multiple_faces():
    """
    Multiple faces visible continuously for >= 2.0s triggers MULTIPLE_FACES_SUSTAINED.
    """
    tracker = TemporalEventTracker(config=TemporalTrackerConfig(sustained_multiple_faces_sec=2.0))
    multi = {"status": "multiple_faces", "face_count": 2, "confidence": 0.96}

    tracker.evaluate_frame("test_sess", multi, current_time=400.0)
    assert len(tracker.evaluate_frame("test_sess", multi, current_time=401.0)) == 0

    events = tracker.evaluate_frame("test_sess", multi, current_time=402.1)
    assert len(events) == 1
    assert events[0]["event_type"] == "MULTIPLE_FACES_SUSTAINED"
    assert events[0]["severity"] == "critical"


# ==============================================================================
# 3. LAYER C TESTS: VLM Provider Abstraction & Error Handling
# ==============================================================================

def test_vlm_gemini_provider_mocked_success():
    """Test Gemini provider handles structured output parsing correctly."""
    mock_response = MagicMock()
    mock_response.text = '{"candidate_visible": true, "candidate_count": 1, "unauthorized_devices_observed": false, "device_description": "none", "behavior_notes": "Candidate focused on screen"}'

    provider = GeminiVisionProvider(api_key="TEST_API_KEY")
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = VLMAnalysisRequest(image_base64="dummy_b64", incident_context="Integrity review")
        res = provider.analyze_snapshot(req)

        assert res.status == "success"
        assert res.provider_name == "gemini_vision"
        assert res.unverified_by_examiner is True
        assert res.observations["candidate_visible"] is True
        assert "Candidate focused" in res.semantic_summary


def test_vlm_gemini_provider_timeout_error():
    """Test Gemini provider gracefully normalizes timeouts."""
    provider = GeminiVisionProvider(api_key="TEST_API_KEY")
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = TimeoutError("Request timed out after 8s")

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = VLMAnalysisRequest(image_base64="dummy_b64")
        res = provider.analyze_snapshot(req)

        assert res.status == "timeout"
        assert "timed out" in res.error_message.lower()


def test_vlm_gemini_provider_quota_exceeded():
    """Test Gemini provider gracefully normalizes rate limits or quota exhaustion."""
    provider = GeminiVisionProvider(api_key="TEST_API_KEY")
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = Exception("429 Resource has been exhausted (quota limit)")

    with patch.object(provider, "_get_client", return_value=mock_client):
        req = VLMAnalysisRequest(image_base64="dummy_b64")
        res = provider.analyze_snapshot(req)

        assert res.status == "quota_exceeded"
        assert res.semantic_summary is None


def test_vlm_groq_provider_decommissioned_status():
    """Test Groq provider reports unavailable status for decommissioned vision models."""
    provider = GroqVisionProvider(api_key="gsk_test")
    req = VLMAnalysisRequest(image_base64="dummy_b64")
    res = provider.analyze_snapshot(req)

    assert res.status == "unavailable"
    assert "decommissioned" in res.error_message.lower()


def test_vlm_service_both_providers_disabled_graceful_degradation():
    """
    Resilience guarantee: When all cloud providers are disabled or unavailable,
    the review service reports unavailable without crashing.
    """
    service = VLMIncidentReviewService()
    service.providers["gemini_vision"] = GeminiVisionProvider(api_key="")
    service.providers["groq_vision"] = GroqVisionProvider(api_key="")

    res = service.review_incident(image_base64="dummy_b64", incident_context="Audit")
    assert res["status"] == "unavailable"


# ==============================================================================
# 4. EVENT CONTRACT & API IDEMPOTENCY TESTS
# ==============================================================================

def test_api_event_idempotency_deduplication(client: TestClient, db_session: Session):
    """
    Idempotency: Submitting duplicate events with same event_id or rapid identical calls returns existing event.
    """
    # 1. Create active session
    sess_res = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Idempotent Candidate",
        "candidate_id": "CAND-IDEM-01"
    })
    assert sess_res.status_code == 201
    session_id = sess_res.json()["id"]

    # 2. Log first event with explicit UUID
    custom_event_id = "test-event-uuid-12345"
    e1 = client.post(f"/api/sessions/{session_id}/events", json={
        "event_type": "WINDOW_BLUR",
        "source": "electron_main",
        "severity": "medium",
        "confidence": 1.0,
        "metadata": {"event_id": custom_event_id, "duration_ms": 500}
    })
    assert e1.status_code == 201
    assert e1.json()["id"] == custom_event_id

    # 3. Log duplicate event with same ID
    e2 = client.post(f"/api/sessions/{session_id}/events", json={
        "event_type": "WINDOW_BLUR",
        "source": "electron_main",
        "severity": "medium",
        "confidence": 1.0,
        "metadata": {"event_id": custom_event_id, "duration_ms": 500}
    })
    assert e2.status_code == 201
    assert e2.json()["id"] == custom_event_id

    # Verify database has only 1 WINDOW_BLUR event, not 2
    events_res = client.get(f"/api/sessions/{session_id}/events")
    blur_events = [ev for ev in events_res.json() if ev["event_type"] == "WINDOW_BLUR"]
    assert len(blur_events) == 1


def test_api_invalid_session_handling(client: TestClient):
    """Verify posting events to a non-existent session returns 404."""
    resp = client.post("/api/sessions/non-existent-session-uuid/events", json={
        "event_type": "WINDOW_BLUR",
        "source": "test",
        "severity": "low",
        "confidence": 1.0
    })
    assert resp.status_code == 404


def test_api_incident_review_endpoint(client: TestClient, db_session: Session):
    """Verify Layer C on-demand forensic incident review endpoint."""
    sess_res = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Forensic Review Candidate",
        "candidate_id": "CAND-REV-01"
    })
    session_id = sess_res.json()["id"]

    dummy_b64 = make_test_image_b64(width=320, height=240)

    # Mock VLM service to return structured observation
    with patch("app.routes.sessions.global_vlm_service.review_incident") as mock_review:
        mock_review.return_value = {
            "provider_name": "gemini_vision",
            "model_name": "gemini-3.1-flash-lite",
            "status": "success",
            "semantic_summary": "Candidate seated in well-lit room, no devices visible",
            "observations": {"candidate_visible": True, "unauthorized_devices_observed": False},
            "latency_ms": 320.5,
            "error_message": None,
            "unverified_by_examiner": True
        }

        resp = client.post(f"/api/sessions/{session_id}/incident-review", json={
            "image_base64": dummy_b64,
            "incident_context": "Candidate reported background disturbance"
        })

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["unverified_by_examiner"] is True
        assert "no devices visible" in data["semantic_summary"]
