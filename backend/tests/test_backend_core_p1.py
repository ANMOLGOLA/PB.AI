from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.seed import DEMO_EXAM_ID
from app.models import OTPVerification, ExamSession, Question


def test_otp_send_and_verify_flow(client: TestClient, db_session: Session):
    """Test OTP generation, dev code retrieval, and successful identity verification."""
    # 1. Dispatch OTP
    email = "candidate.p1@university.edu"
    send_resp = client.post("/api/auth/otp/send", json={"identifier": email})
    assert send_resp.status_code == 200
    data = send_resp.json()
    assert data["status"] == "sent"
    assert data["identifier"] == email
    dev_otp = data.get("dev_otp")
    assert dev_otp is not None
    assert len(dev_otp) == 6

    # 2. Verify with valid OTP
    verify_resp = client.post("/api/auth/otp/verify", json={
        "identifier": email,
        "otp_code": dev_otp
    })
    assert verify_resp.status_code == 200
    v_data = verify_resp.json()
    assert v_data["status"] == "verified"
    assert v_data["verified"] is True
    assert v_data["token"].startswith("tok_")
    assert v_data["candidate_id"].startswith("cand_")


def test_otp_verify_invalid_code_and_exhaustion(client: TestClient, db_session: Session):
    """Test wrong OTP decrements attempts and locks out after threshold."""
    email = "wrong.otp@university.edu"
    send_resp = client.post("/api/auth/otp/send", json={"identifier": email})
    assert send_resp.status_code == 200

    # Wrong attempt 1
    resp1 = client.post("/api/auth/otp/verify", json={"identifier": email, "otp_code": "000000"})
    assert resp1.status_code == 400
    assert "Attempts remaining: 2" in resp1.json()["detail"]

    # Wrong attempt 2
    resp2 = client.post("/api/auth/otp/verify", json={"identifier": email, "otp_code": "000000"})
    assert resp2.status_code == 400
    assert "Attempts remaining: 1" in resp2.json()["detail"]

    # Wrong attempt 3
    resp3 = client.post("/api/auth/otp/verify", json={"identifier": email, "otp_code": "000000"})
    assert resp3.status_code == 400
    assert "Attempts remaining: 0" in resp3.json()["detail"]

    # Attempt 4: Should return 429 lock out
    resp4 = client.post("/api/auth/otp/verify", json={"identifier": email, "otp_code": "000000"})
    assert resp4.status_code == 429
    assert "Maximum verification attempts exceeded" in resp4.json()["detail"]


def test_otp_expired_rejection(client: TestClient, db_session: Session):
    """Test expired OTP rejection."""
    email = "expired@university.edu"
    send_resp = client.post("/api/auth/otp/send", json={"identifier": email})
    assert send_resp.status_code == 200
    otp = send_resp.json()["dev_otp"]

    # Manually expire the record in the database
    rec = db_session.query(OTPVerification).filter(OTPVerification.identifier == email).first()
    assert rec is not None
    rec.expires_at = datetime.now(timezone.utc) - timedelta(seconds=60)
    db_session.commit()

    verify_resp = client.post("/api/auth/otp/verify", json={
        "identifier": email,
        "otp_code": otp
    })
    assert verify_resp.status_code == 400
    assert "expired" in verify_resp.json()["detail"].lower()


def test_public_exam_details_and_zero_answer_leakage(client: TestClient, db_session: Session):
    """Test GET /api/exams/{exam_id} ensures complete question delivery with zero answer key leakage."""
    resp = client.get(f"/api/exams/{DEMO_EXAM_ID}")
    assert resp.status_code == 200
    exam = resp.json()
    assert exam["id"] == DEMO_EXAM_ID
    assert len(exam["questions"]) >= 5

    # Strictly verify correct_choice_id is omitted everywhere in public response
    for q in exam["questions"]:
        assert "correct_choice_id" not in q
        assert "answer" not in q
        for c in q["choices"]:
            assert "is_correct" not in c
            assert "correct" not in c

    # 404 for invalid exam
    missing = client.get("/api/exams/non-existent-exam-id")
    assert missing.status_code == 404


def test_airtable_sync_fallback(client: TestClient, db_session: Session):
    """Test Airtable synchronization falls back gracefully to local database cache when offline/unconfigured."""
    resp = client.post(f"/api/exams/{DEMO_EXAM_ID}/sync-airtable")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "synced_local_cache"
    assert data["source"] == "local_cache_fallback"
    assert data["exam_id"] == DEMO_EXAM_ID
    assert data["questions_synced"] >= 5


def test_batch_autosave_and_session_recovery(client: TestClient, db_session: Session):
    """Test batch autosave and reloading candidate answers."""
    # 1. Create active session
    create_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Autosave Candidate",
        "candidate_id": "CAND-AUTOSAVE-01"
    })
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]

    # 2. Fetch exam questions
    exam_resp = client.get(f"/api/exams/{DEMO_EXAM_ID}")
    questions = exam_resp.json()["questions"]
    q1 = questions[0]
    q2 = questions[1]

    # 3. Batch autosave 2 answers
    save_payload = {
        "answers": {
            q1["id"]: q1["choices"][0]["id"],
            q2["id"]: q2["choices"][1]["id"]
        }
    }
    autosave_resp = client.post(f"/api/sessions/{session_id}/autosave", json=save_payload)
    assert autosave_resp.status_code == 200
    assert autosave_resp.json()["saved_count"] == 2

    # 4. Recover session answers
    recov_resp = client.get(f"/api/sessions/{session_id}/answers")
    assert recov_resp.status_code == 200
    recovered_answers = recov_resp.json()["answers"]
    assert recovered_answers[q1["id"]] == q1["choices"][0]["id"]
    assert recovered_answers[q2["id"]] == q2["choices"][1]["id"]


def test_server_authoritative_timer(client: TestClient, db_session: Session):
    """Test server-authoritative timer calculates elapsed and remaining time accurately."""
    # 1. Create active session
    create_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Timer Candidate",
        "candidate_id": "CAND-TIMER-01"
    })
    session_id = create_resp.json()["id"]

    # 2. Check timer
    timer_resp = client.get(f"/api/sessions/{session_id}/timer")
    assert timer_resp.status_code == 200
    t_data = timer_resp.json()
    assert t_data["session_id"] == session_id
    assert t_data["duration_minutes"] == 30
    assert t_data["total_seconds"] == 1800
    assert t_data["elapsed_seconds"] >= 0
    assert t_data["time_remaining_seconds"] <= 1800
    assert t_data["is_expired"] is False


def test_submit_scoring_and_idempotency(client: TestClient, db_session: Session):
    """Test submit calculates score server-side against hidden answer key and is idempotent."""
    create_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Scoring Candidate",
        "candidate_id": "CAND-SCORE-01"
    })
    session_id = create_resp.json()["id"]

    # Look up correct choices directly from backend DB for testing scoring
    q_all = db_session.query(Question).filter(Question.exam_id == DEMO_EXAM_ID).all()
    assert len(q_all) >= 2

    # Answer first question correctly, second question incorrectly
    correct_choice_q0 = q_all[0].correct_choice_id
    wrong_choice_q1 = [c.id for c in q_all[1].choices if c.id != q_all[1].correct_choice_id][0]

    client.post(f"/api/sessions/{session_id}/autosave", json={
        "answers": {
            q_all[0].id: correct_choice_q0,
            q_all[1].id: wrong_choice_q1
        }
    })

    # Submit
    sub_resp = client.post(f"/api/sessions/{session_id}/submit")
    assert sub_resp.status_code == 200
    res = sub_resp.json()
    assert res["status"] == "submitted"
    assert res["score"] == 1
    assert res["total_questions"] == len(q_all)

    # Second submit (idempotent call)
    sub2_resp = client.post(f"/api/sessions/{session_id}/submit")
    assert sub2_resp.status_code == 200
    res2 = sub2_resp.json()
    assert res2["status"] == "submitted"
    assert res2["score"] == 1
    assert res2["percentage"] == res["percentage"]
