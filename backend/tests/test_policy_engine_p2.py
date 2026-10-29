import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.seed import DEMO_EXAM_ID
from app.policy import UnifiedEvent, calculate_explainable_risk, global_policy_engine
from app.models import IntegrityEvent, ExamSession


def test_unified_event_serialization():
    """Verify UnifiedEvent serialization into canonical event format."""
    ev = UnifiedEvent(
        session_id="test-session-123",
        type="AI_QUERY",
        severity="high",
        confidence=0.95,
        source="browser_agent",
        metadata={"query": "binary search implementation", "domain": "chatgpt.com"}
    )
    d = ev.to_dict()
    assert d["session_id"] == "test-session-123"
    assert d["type"] == "AI_QUERY"
    assert d["severity"] == "high"
    assert d["confidence"] == 0.95
    assert d["source"] == "browser_agent"
    assert d["metadata"]["domain"] == "chatgpt.com"
    assert "ts" in d


def test_explainable_risk_scoring():
    """Verify risk categories (AI, vision, focus) and factor breakdown."""
    events = [
        IntegrityEvent(
            id="ev1",
            session_id="sess-1",
            event_type="AI_QUERY",
            severity="high",
            confidence=1.0,
            metadata_json='{"query": "dijkstra algorithm", "domain": "chatgpt.com", "overlap_score": 0.8}'
        ),
        IntegrityEvent(
            id="ev2",
            session_id="sess-1",
            event_type="NO_FACE_DETECTED",
            severity="medium",
            confidence=1.0,
            metadata_json='{"duration_ms": 4000}'
        ),
        IntegrityEvent(
            id="ev3",
            session_id="sess-1",
            event_type="WINDOW_BLUR",
            severity="low",
            confidence=1.0,
            metadata_json='{"duration_ms": 1200}'
        )
    ]

    report = calculate_explainable_risk(events)
    assert report["overall_score"] > 0
    assert report["risk_level"] in ("low", "moderate", "high", "critical")
    assert len(report["factors"]) == 3

    categories = [f["category"] for f in report["factors"]]
    assert "External Assistance & AI Search" in categories
    assert "Visual & Biometric Integrity" in categories
    assert "Focus & Environment" in categories


def test_policy_threshold_log_to_warn(client: TestClient, db_session: Session):
    """Test policy transition from log to warn as violation count increases."""
    sess_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Policy Candidate",
        "candidate_id": "CAND-POL-01"
    })
    session_id = sess_resp.json()["id"]

    # 1. First event: info/low severity -> action should be log
    ev1 = client.post(f"/api/sessions/{session_id}/events", json={
        "event_type": "WINDOW_BLUR",
        "source": "browser_agent",
        "severity": "low",
        "confidence": 1.0,
        "metadata": {"event_id": "pol-ev-1"}
    })
    assert ev1.status_code == 201

    risk1 = client.get(f"/api/sessions/{session_id}/risk").json()
    assert risk1["warning_count"] == 0
    assert risk1["action"] == "log"

    # 2. Add 3 medium severity events to reach warning threshold (default 3)
    for i in range(2, 5):
        client.post(f"/api/sessions/{session_id}/events", json={
            "event_type": "GAZE_AWAY_FROM_SCREEN",
            "source": "cv_engine",
            "severity": "medium",
            "confidence": 1.0,
            "metadata": {"event_id": f"pol-ev-{i}"}
        })

    risk2 = client.get(f"/api/sessions/{session_id}/risk").json()
    assert risk2["warning_count"] >= 3
    assert risk2["action"] == "warn"
    assert "warning_message" in risk2


def test_policy_auto_submit_threshold(client: TestClient, db_session: Session):
    """Test exceeding auto_submit threshold (5 violations) triggers automated submission."""
    sess_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "AutoSubmit Candidate",
        "candidate_id": "CAND-AUTOSUB-01"
    })
    session_id = sess_resp.json()["id"]

    # Post 5 high severity events
    for i in range(1, 6):
        client.post(f"/api/sessions/{session_id}/events", json={
            "event_type": "PHONE_DETECTED",
            "source": "cv_engine",
            "severity": "high",
            "confidence": 1.0,
            "metadata": {"event_id": f"auto-sub-ev-{i}"}
        })

    # Verify session automatically transitioned to "submitted"
    status_resp = client.get(f"/api/sessions/{session_id}/status").json()
    assert status_resp["status"] == "submitted"


def test_export_session_csv_endpoint(client: TestClient, db_session: Session):
    """Test CSV export endpoint formats RFC 4180 audit records."""
    sess_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "CSV Candidate",
        "candidate_id": "CAND-CSV-01"
    })
    session_id = sess_resp.json()["id"]

    client.post(f"/api/sessions/{session_id}/events", json={
        "event_type": "QUERY_SUBMITTED",
        "source": "sandboxed_webview",
        "severity": "medium",
        "confidence": 1.0,
        "metadata": {"domain": "claude.ai", "query": "recursion base case", "event_id": "csv-ev-1"}
    })

    export_resp = client.get(f"/api/examiner/sessions/{session_id}/export.csv?auth_code=TEACHER-UNLOCK-2026")
    assert export_resp.status_code == 200
    assert export_resp.headers["content-type"].startswith("text/csv")
    csv_text = export_resp.text
    assert "QUERY_SUBMITTED" in csv_text
    assert "claude.ai" in csv_text
    assert "recursion base case" in csv_text
