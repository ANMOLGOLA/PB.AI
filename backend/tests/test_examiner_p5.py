from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.seed import DEMO_EXAM_ID
from app.models import ExamSession, IntegrityEvent, Question


def test_examiner_token_authorization(client: TestClient, db_session: Session):
    """Test examiner token authorization rejection on invalid and acceptance on valid code."""
    # 1. Missing token -> 422
    r_miss = client.get("/api/examiner/sessions")
    assert r_miss.status_code == 422

    # 2. Invalid token -> 403
    r_inv = client.get("/api/examiner/sessions?auth_code=INVALID-TOKEN-X")
    assert r_inv.status_code == 403

    # 3. Valid code -> 200
    r_valid = client.get("/api/examiner/sessions?auth_code=TEACHER-UNLOCK-2026")
    assert r_valid.status_code == 200
    assert isinstance(r_valid.json(), list)


def test_examiner_candidate_list_and_details(client: TestClient, db_session: Session):
    """Test candidate session listing and detailed forensic review."""
    sess_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Examiner Test Candidate",
        "candidate_id": "CAND-EXAM-01"
    })
    session_id = sess_resp.json()["id"]

    # Post sample narrative telemetry
    client.post(f"/api/sessions/{session_id}/events", json={
        "event_type": "EXTERNAL_DOMAIN_OPENED",
        "source": "sandboxed_webview",
        "severity": "info",
        "confidence": 1.0,
        "metadata": {"domain": "claude.ai", "event_id": "narr-ev-1"}
    })
    client.post(f"/api/sessions/{session_id}/events", json={
        "event_type": "EXTERNAL_QUERY_SUBMITTED",
        "source": "sandboxed_webview",
        "severity": "medium",
        "confidence": 1.0,
        "metadata": {"domain": "claude.ai", "query": "binary search tree in python", "event_id": "narr-ev-2"}
    })

    # Fetch candidate details
    detail_resp = client.get(f"/api/examiner/sessions/{session_id}?auth_code=TEACHER-UNLOCK-2026")
    assert detail_resp.status_code == 200
    data = detail_resp.json()
    assert data["session"]["session_id"] == session_id
    assert data["session"]["candidate_name"] == "Examiner Test Candidate"
    events = data["events"]
    assert len(events) >= 2
    types = [e["event_type"] for e in events]
    assert "EXTERNAL_DOMAIN_OPENED" in types
    assert "EXTERNAL_QUERY_SUBMITTED" in types


def test_examiner_force_submit_scoring(client: TestClient, db_session: Session):
    """Test examiner terminating candidate session scores answers and locks session."""
    sess_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Force Submit Candidate",
        "candidate_id": "CAND-FS-01"
    })
    session_id = sess_resp.json()["id"]

    # Terminate candidate session
    term_resp = client.post(
        f"/api/examiner/sessions/{session_id}/terminate?auth_code=TEACHER-UNLOCK-2026",
        json={"reason": "Proctor forced submission due to exam time expiration"}
    )
    assert term_resp.status_code == 200
    res = term_resp.json()
    assert res["status"] == "terminated"

    # Check status endpoint reflects lock
    st_resp = client.get(f"/api/sessions/{session_id}/status").json()
    assert st_resp["is_locked"] is True


def test_audit_export_csv_and_json(client: TestClient, db_session: Session):
    """Test both CSV and JSON audit export formats."""
    sess_resp = client.post("/api/sessions", json={
        "exam_id": DEMO_EXAM_ID,
        "candidate_name": "Export Audit Candidate",
        "candidate_id": "CAND-AUDIT-01"
    })
    session_id = sess_resp.json()["id"]

    # 1. JSON Report
    json_resp = client.get(f"/api/examiner/sessions/{session_id}/report?auth_code=TEACHER-UNLOCK-2026")
    assert json_resp.status_code == 200
    json_data = json_resp.json()
    assert "candidate" in json_data
    assert "events_timeline" in json_data

    # 2. CSV Export
    csv_resp = client.get(f"/api/examiner/sessions/{session_id}/export.csv?auth_code=TEACHER-UNLOCK-2026")
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert "Timestamp (UTC),Event ID,Event Type" in csv_resp.text
