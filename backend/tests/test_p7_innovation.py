import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db, SessionLocal
from app.models import Exam, ExamSession, IntegrityEvent
from app.policy.similarity import calculate_query_question_similarity
from app.policy.risk_scorer import calculate_explainable_risk

client = TestClient(app)


def test_calculate_query_question_similarity_unrelated():
    query = "how to bake chocolate cookies"
    question = "In an Electron desktop application architecture, which configuration is mandatory to guarantee contextIsolation?"
    res = calculate_query_question_similarity(query, question)
    assert res["is_likely_seeking"] is False
    assert res["similarity_score"] < 0.2
    assert len(res["matched_tokens"]) == 0


def test_calculate_query_question_similarity_likely_seeking():
    query = "electron runtime APIs isolated from web renderer"
    question = "In an Electron desktop application architecture, which configuration is mandatory to guarantee that Node.js runtime APIs are completely isolated from the web renderer?"
    res = calculate_query_question_similarity(query, question)
    assert res["is_likely_seeking"] is True
    assert res["similarity_score"] >= 0.35
    assert "renderer" in res["matched_tokens"]
    assert "electron" in res["matched_tokens"]
    assert "isolated" in res["matched_tokens"]


def test_event_ingestion_flags_answer_seeking():
    import uuid
    db = SessionLocal()
    try:
        exam = db.query(Exam).first()
        assert exam is not None, "Seeded exam must exist"

        cand_id = f"CAND-P7-SIM-{uuid.uuid4().hex[:6]}"
        # Create session
        create_res = client.post(
            "/api/sessions",
            json={
                "exam_id": exam.id,
                "candidate_name": "Test P7 Candidate",
                "candidate_id": cand_id
            }
        )
        assert create_res.status_code in (200, 201)
        session_id = create_res.json()["id"]

        first_q = exam.questions[0]

        # Submit matching query event
        evt_res = client.post(
            f"/api/sessions/{session_id}/events",
            json={
                "event_type": "EXTERNAL_QUERY_SUBMITTED",
                "source": "sandboxed_webview",
                "severity": "medium",
                "confidence": 1.0,
                "metadata": {
                    "domain": "google.com",
                    "query": "electron runtime APIs isolated from web renderer",
                    "active_question_id": first_q.id,
                    "active_question_text": first_q.text
                }
            }
        )
        assert evt_res.status_code == 201
        data = evt_res.json()
        assert data["severity"] == "high"
        assert data["metadata"]["likely_answer_seeking"] is True
        assert data["metadata"]["similarity_score"] > 0.3
        assert len(data["metadata"]["matched_keywords"]) >= 2
    finally:
        db.close()


def test_duplicate_login_detection_logs_event():
    import uuid
    db = SessionLocal()
    try:
        exam = db.query(Exam).first()
        candidate_id = f"CAND-DUP-TEST-{uuid.uuid4().hex[:6]}"

        # Initial login
        res1 = client.post(
            "/api/sessions",
            json={
                "exam_id": exam.id,
                "candidate_name": "Duplicate Tester",
                "candidate_id": candidate_id
            }
        )
        assert res1.status_code in (200, 201)
        session_id = res1.json()["id"]

        # Artificially age the session by 45s to simulate established session
        sess = db.query(ExamSession).filter(ExamSession.id == session_id).first()
        sess.started_at = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 45, tz=timezone.utc)
        db.commit()

        # Second concurrent login
        res2 = client.post(
            "/api/sessions",
            json={
                "exam_id": exam.id,
                "candidate_name": "Duplicate Tester",
                "candidate_id": candidate_id
            }
        )
        assert res2.status_code in (200, 201)
        assert res2.json()["id"] == session_id

        # Check for DUPLICATE_LOGIN_DETECTED in events
        events = db.query(IntegrityEvent).filter(
            IntegrityEvent.session_id == session_id,
            IntegrityEvent.event_type == "DUPLICATE_LOGIN_DETECTED"
        ).all()
        assert len(events) >= 1
        assert events[0].severity == "high"
    finally:
        db.close()


def test_risk_scorer_incorporates_answer_seeking_and_duplicate():
    # Synthetic events
    ev_seeking = IntegrityEvent(
        id="ev-seeking-1",
        session_id="dummy",
        event_type="EXTERNAL_QUERY_SUBMITTED",
        severity="high",
        confidence=1.0,
        metadata_json='{"query": "contextisolation electron", "domain": "google.com", "likely_answer_seeking": true, "similarity_score": 0.8}'
    )
    ev_dup = IntegrityEvent(
        id="ev-dup-1",
        session_id="dummy",
        event_type="DUPLICATE_LOGIN_DETECTED",
        severity="high",
        confidence=1.0,
        metadata_json='{"message": "duplicate session"}'
    )

    risk = calculate_explainable_risk([ev_seeking, ev_dup])
    ai_factor = next(f for f in risk["factors"] if "External Assistance" in f["category"])
    focus_factor = next(f for f in risk["factors"] if "Focus & Environment" in f["category"])

    assert ai_factor["contribution"] == 45  # capped at 45
    assert focus_factor["contribution"] >= 20  # capped at 20
    assert risk["overall_score"] >= 65
    assert "answer-seeking" in ai_factor["details"].lower()
    assert "duplicate" in focus_factor["details"].lower()
