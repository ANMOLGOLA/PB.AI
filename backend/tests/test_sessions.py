import base64
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.seed import DEMO_EXAM_ID


def test_session_lifecycle_and_proctoring(client: TestClient, db_session: Session):
    """Test full session lifecycle: creation, answering, CV frame analysis, and submission."""
    # 1. Create a session
    resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Jane Doe",
        "candidate_id": "CAND-2026-001"
    })
    assert resp.status_code == 201
    session_data = resp.json()
    session_id = session_data["id"]
    assert session_data["status"] == "active"
    assert session_data["candidate_name"] == "Jane Doe"

    # 2. Answer question 1
    q_resp = client.get("/api/exams")
    assert q_resp.status_code == 200
    q1 = q_resp.json()[0]["questions"][0]
    choice_id = q1["choices"][0]["id"]

    ans_resp = client.put(f"/api/sessions/{session_id}/answers/{q1['id']}", json={
        "selected_choice_id": choice_id
    })
    assert ans_resp.status_code == 200
    assert ans_resp.json()["status"] == "saved"

    # 3. Log a window blur event
    event_resp = client.post(f"/api/sessions/{session_id}/events", json={
        "event_type": "WINDOW_BLUR",
        "source": "electron_main",
        "severity": "medium",
        "confidence": 1.0,
        "metadata": {"duration_ms": 1200}
    })
    assert event_resp.status_code == 201
    assert event_resp.json()["event_type"] == "WINDOW_BLUR"

    # 4. Analyze frame with dummy image (no face)
    # 1x1 black pixel PNG base64
    dummy_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    cv_resp = client.post("/api/proctor/analyze-frame", json={
        "image_base64": dummy_b64,
        "session_id": session_id
    })
    assert cv_resp.status_code == 200
    cv_data = cv_resp.json()
    assert cv_data["face_detected"] is False
    assert cv_data["face_count"] == 0
    assert cv_data["status"] == "no_face"

    # 5. Submit session
    submit_resp = client.post(f"/api/sessions/{session_id}/submit")
    assert submit_resp.status_code == 200
    result = submit_resp.json()
    assert result["status"] == "submitted"
    assert result["total_questions"] == 5
    assert "score" in result
    assert "events" in result
    assert len(result["events"]) >= 3  # SESSION_STARTED, WINDOW_BLUR, NO_FACE_DETECTED, SESSION_SUBMITTED


def test_pre_exam_scan_and_teacher_unlock(client: TestClient, db_session: Session):
    """Test pre-exam scan endpoint and teacher unlock security overrides."""
    # 1. Pre-exam scan on dummy frame
    dummy_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    scan_resp = client.post("/api/proctor/pre-exam-scan", json={
        "image_base64": dummy_b64,
        "candidate_id": "CAND-999"
    })
    assert scan_resp.status_code == 200
    scan_data = scan_resp.json()
    assert "face_id" in scan_data
    assert "phone_detected" in scan_data

    # 2. Create session with Face ID
    sess_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Alice Smith",
        "candidate_id": "CAND-ALICE-1",
        "face_id": scan_data["face_id"]
    })
    assert sess_resp.status_code == 201
    session_id = sess_resp.json()["id"]

    # 3. Test Teacher Unlock with INVALID code
    fail_unlock = client.post(f"/api/sessions/{session_id}/unlock", json={
        "teacher_code": "INVALID_CODE_123"
    })
    assert fail_unlock.status_code == 403

    # 4. Test Teacher Unlock with VALID code
    pass_unlock = client.post(f"/api/sessions/{session_id}/unlock", json={
        "teacher_code": "TEACHER-UNLOCK-2026"
    })
    assert pass_unlock.status_code == 200
    assert pass_unlock.json()["unlocked"] is True

    # 5. Test Teacher Unlock with secondary VALID code
    pass_unlock2 = client.post(f"/api/sessions/{session_id}/unlock", json={
        "teacher_code": "ELEV8-2026"
    })
    assert pass_unlock2.status_code == 200
    assert pass_unlock2.json()["unlocked"] is True

    # 6. Test Groq Engine Status & Configuration
    status_resp = client.get("/api/proctor/engine")
    assert status_resp.status_code == 200
    assert "engine" in status_resp.json()

    config_resp = client.post("/api/proctor/engine/configure", json={
        "api_key": "gsk_test_mock_key_abc",
        "model": "llama-3.2-11b-vision-preview"
    })
    assert config_resp.status_code == 200
    assert config_resp.json()["configured"] is True


def test_mandatory_screen_share_and_readiness(client: TestClient, db_session: Session):
    """Test mandatory screen share gating before candidate can enter assessment."""
    from app.routes.webrtc import signaling_manager

    # 1. Create a session
    resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Bob Stone",
        "candidate_id": "CAND-BOB-99",
        "face_id": "FID-TEST-BOB"
    })
    assert resp.status_code == 201
    session_id = resp.json()["id"]

    # 2. Check readiness before screen sharing -> should NOT be ready
    readiness_resp = client.get(f"/api/sessions/{session_id}/readiness")
    assert readiness_resp.status_code == 200
    assert readiness_resp.json()["screen_sharing_active"] is False
    assert readiness_resp.json()["is_ready"] is False

    # 3. Attempting to start assessment without active screen sharing must be rejected (400)
    start_fail = client.post(f"/api/sessions/{session_id}/start")
    assert start_fail.status_code == 400
    assert "Screen sharing is required" in start_fail.json()["detail"]

    # 4. Candidate connects screen share to signaling room
    room = signaling_manager.get_or_create_room(session_id)
    room.is_sharing = True

    # 5. Check readiness now -> ready
    readiness_ok = client.get(f"/api/sessions/{session_id}/readiness")
    assert readiness_ok.status_code == 200
    assert readiness_ok.json()["screen_sharing_active"] is True
    assert readiness_ok.json()["is_ready"] is True

    # 6. Start assessment endpoint succeeds
    start_ok = client.post(f"/api/sessions/{session_id}/start")
    assert start_ok.status_code == 200
    assert start_ok.json()["status"] == "started"
    assert start_ok.json()["screen_sharing_active"] is True

    # Clean up room
    room.is_sharing = False


def test_student_portal_lockdown_and_recovery(client: TestClient, db_session: Session):
    """Test duplicate session prevention, answer restoration, input validation, and idempotent submission."""
    # 1. Create initial session
    resp1 = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Marcus Aurelius",
        "candidate_id": "CAND-MARCUS-001"
    })
    assert resp1.status_code == 201
    session_id = resp1.json()["id"]

    # 2. Re-attempt to create session with same candidate & exam (e.g. page refresh) -> reuses existing session
    resp2 = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Marcus Aurelius",
        "candidate_id": "CAND-MARCUS-001"
    })
    assert resp2.status_code == 201
    assert resp2.json()["id"] == session_id  # Same session returned!

    # 3. Save valid answer
    exams = client.get("/api/exams").json()
    q1 = exams[0]["questions"][0]
    valid_choice_id = q1["choices"][0]["id"]

    ans_save = client.put(f"/api/sessions/{session_id}/answers/{q1['id']}", json={
        "selected_choice_id": valid_choice_id
    })
    assert ans_save.status_code == 200

    # 4. Attempt to save answer for invalid question ID -> 400
    bad_q = client.put(f"/api/sessions/{session_id}/answers/non-existent-question", json={
        "selected_choice_id": valid_choice_id
    })
    assert bad_q.status_code == 400

    # 5. Fetch answers via recovery endpoint -> returns saved answer
    ans_fetch = client.get(f"/api/sessions/{session_id}/answers")
    assert ans_fetch.status_code == 200
    assert ans_fetch.json()["answers"][q1["id"]] == valid_choice_id

    # 6. Submit session
    sub1 = client.post(f"/api/sessions/{session_id}/submit")
    assert sub1.status_code == 200
    assert sub1.json()["status"] == "submitted"

    # 7. Resubmit idempotency: calling submit again on submitted session returns cleanly
    sub2 = client.post(f"/api/sessions/{session_id}/submit")
    assert sub2.status_code == 200
    assert sub2.json()["status"] == "submitted"
    assert sub2.json()["score"] == sub1.json()["score"]

    # 8. Attempting to start a new session after submission is rejected
    re_post = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Marcus Aurelius",
        "candidate_id": "CAND-MARCUS-001"
    })
    assert re_post.status_code == 400
    assert "already been submitted" in re_post.json()["detail"]
