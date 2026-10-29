"""
Automated Test Suite for Sentinel Exam WebRTC Signaling and Examiner Hub
"""

import json
import pytest
from app.models import ExamSession, Exam, IntegrityEvent


def test_webrtc_config_endpoint(client):
    """Verify WebRTC ICE servers configuration endpoint returns valid STUN/TURN config."""
    res = client.get("/api/webrtc/config")
    assert res.status_code == 200
    data = res.json()
    assert "iceServers" in data
    assert isinstance(data["iceServers"], list)
    assert len(data["iceServers"]) >= 1
    assert "urls" in data["iceServers"][0]


def test_examiner_sessions_authorization(client, db_session):
    """Verify examiner sessions endpoint enforces teacher authorization codes."""
    # 1. Missing auth_code returns 422 validation error
    res = client.get("/api/examiner/sessions")
    assert res.status_code == 422

    # 2. Invalid auth_code returns 403 Forbidden
    res = client.get("/api/examiner/sessions?auth_code=WRONG-CODE-999")
    assert res.status_code == 403

    # 3. Valid authorization code returns 200 OK and list of sessions
    valid_codes = ["TEACHER-UNLOCK-2026", "ELEV8-2026", "778899"]
    for code in valid_codes:
        res = client.get(f"/api/examiner/sessions?auth_code={code}")
        assert res.status_code == 200
        assert isinstance(res.json(), list)


def test_examiner_session_detail_endpoint(client, db_session):
    """Verify examiner session details endpoint with valid authorization."""
    # Create an active test session
    exam = db_session.query(Exam).first()
    assert exam is not None

    create_res = client.post(
        "/api/sessions",
        json={
            "exam_id": exam.id,
            "candidate_name": "Test Screen Sharer",
            "candidate_id": "CAND-WEBRTC-001"
        }
    )
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    # 1. Invalid code -> 403
    res = client.get(f"/api/examiner/sessions/{session_id}?auth_code=INVALID")
    assert res.status_code == 403

    # 2. Non-existent session -> 404
    res = client.get("/api/examiner/sessions/non-existent-uuid-1234?auth_code=TEACHER-UNLOCK-2026")
    assert res.status_code == 404

    # 3. Valid session detail -> 200 with session metadata and events list
    res = client.get(f"/api/examiner/sessions/{session_id}?auth_code=TEACHER-UNLOCK-2026")
    assert res.status_code == 200
    data = res.json()
    assert "session" in data
    assert data["session"]["session_id"] == session_id
    assert data["session"]["candidate_name"] == "Test Screen Sharer"
    assert "events" in data
    assert isinstance(data["events"], list)


def test_webrtc_signaling_websocket_candidate_and_examiner(client, db_session):
    """Verify end-to-end WebRTC signaling handshake and event emission."""
    exam = db_session.query(Exam).first()
    create_res = client.post(
        "/api/sessions",
        json={
            "exam_id": exam.id,
            "candidate_name": "Alice Sharer",
            "candidate_id": "CAND-WS-001"
        }
    )
    session_id = create_res.json()["id"]

    # 1. Unauthorized examiner socket is rejected
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/webrtc/signal/{session_id}?role=examiner&token=INVALID-TOKEN"):
            pass

    # 2. Candidate connects and initiates screen share
    with client.websocket_connect(f"/api/webrtc/signal/{session_id}?role=candidate") as cand_ws:
        initial_cand_msg = cand_ws.receive_json()
        assert initial_cand_msg["type"] == "peer_status"
        assert initial_cand_msg["role"] == "candidate"

        # Examiner connects to the same session
        with client.websocket_connect(
            f"/api/webrtc/signal/{session_id}?role=examiner&token=TEACHER-UNLOCK-2026"
        ) as exam_ws:
            initial_exam_msg = exam_ws.receive_json()
            assert initial_exam_msg["type"] == "peer_status"
            assert initial_exam_msg["role"] == "examiner"

            # Candidate receives peer_status update indicating examiner is connected
            cand_peer_update = cand_ws.receive_json()
            assert cand_peer_update["type"] == "peer_status"
            assert cand_peer_update["peer_connected"] is True

            # Candidate transmits SDP offer
            dummy_offer = {
                "type": "offer",
                "sdp": {"type": "offer", "sdp": "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"},
                "source_name": "Built-in Display 1",
                "resolution": "1920x1080"
            }
            cand_ws.send_text(json.dumps(dummy_offer))

            # Examiner receives relayed SDP offer
            relayed_offer = exam_ws.receive_json()
            assert relayed_offer["type"] == "offer"
            assert relayed_offer["source_name"] == "Built-in Display 1"

            # Examiner replies with SDP answer
            dummy_answer = {
                "type": "answer",
                "sdp": {"type": "answer", "sdp": "v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"}
            }
            exam_ws.send_text(json.dumps(dummy_answer))

            # Candidate receives relayed SDP answer
            relayed_answer = cand_ws.receive_json()
            assert relayed_answer["type"] == "answer"

            # Candidate sends ICE candidate
            dummy_candidate = {
                "type": "ice-candidate",
                "candidate": {
                    "candidate": "candidate:1 1 UDP 2130706431 192.168.1.100 50000 typ host",
                    "sdpMid": "0",
                    "sdpMLineIndex": 0
                }
            }
            cand_ws.send_text(json.dumps(dummy_candidate))

            # Examiner receives relayed ICE candidate
            relayed_ice = exam_ws.receive_json()
            assert relayed_ice["type"] == "ice-candidate"
            assert "candidate" in relayed_ice["candidate"]

            # Candidate ends screen share
            cand_ws.send_text(json.dumps({
                "type": "stop_share",
                "reason": "Test ended sharing"
            }))

            # Examiner receives stream_stopped notification
            stopped_notif = exam_ws.receive_json()
            assert stopped_notif["type"] == "stream_stopped"

    # 3. Verify normalized audit events were logged in database
    events = (
        db_session.query(IntegrityEvent)
        .filter(IntegrityEvent.session_id == session_id)
        .order_by(IntegrityEvent.occurred_at.asc())
        .all()
    )
    event_types = [e.event_type for e in events]
    assert "SCREEN_SHARE_STARTED" in event_types
    assert "SCREEN_SHARE_STOPPED" in event_types


def test_examiner_overview_metrics(client, db_session):
    """Verify examiner overview returns aggregated counts and proctor status."""
    res = client.get("/api/examiner/overview?auth_code=TEACHER-UNLOCK-2026")
    assert res.status_code == 200
    data = res.json()
    assert "candidates" in data
    assert "incidents" in data
    assert "assigned_proctors" in data
    assert isinstance(data["assigned_proctors"], list)


def test_examiner_incident_queue_and_review_decision(client, db_session):
    """Verify incident review queue filtering and submitting proctor decisions."""
    exam = db_session.query(Exam).first()
    create_res = client.post(
        "/api/sessions",
        json={
            "exam_id": exam.id,
            "candidate_name": "Bob Candidate",
            "candidate_id": "CAND-REV-01"
        }
    )
    session_id = create_res.json()["id"]

    # Log an incident event
    client.post(
        f"/api/sessions/{session_id}/events",
        json={
            "event_type": "GAZE_AWAY_FROM_SCREEN",
            "source": "opencv_cv_engine",
            "severity": "medium",
            "confidence": 0.95,
            "metadata": {"duration_sec": 4.5}
        }
    )

    # 1. Fetch incident queue
    inc_res = client.get(f"/api/examiner/incidents?auth_code=TEACHER-UNLOCK-2026&session_id={session_id}")
    assert inc_res.status_code == 200
    incidents = inc_res.json()
    assert len(incidents) >= 1
    target_event_id = incidents[0]["id"]
    assert incidents[0]["review_status"] == "unreviewed"

    # 2. Submit review decision: ESCALATED with proctor notes
    rev_res = client.post(
        f"/api/examiner/events/{target_event_id}/review?auth_code=TEACHER-UNLOCK-2026",
        json={
            "status": "escalated",
            "reason": "Repeated gaze deviation off-screen confirmed on manual review",
            "proctor_id": "PROCTOR-EVELYN-02"
        }
    )
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["review_status"] == "escalated"
    assert "Repeated gaze deviation" in rev_data["review_notes"]

    # 3. Check decision persisted in DB
    check_res = client.get(f"/api/examiner/incidents?auth_code=TEACHER-UNLOCK-2026&review_status=escalated")
    assert check_res.status_code == 200
    matched = [e for e in check_res.json() if e["id"] == target_event_id]
    assert len(matched) == 1
    assert matched[0]["reviewed_by"] == "PROCTOR-EVELYN-02"


def test_examiner_session_report_and_terminate(client, db_session):
    """Verify comprehensive report generation and remote session termination."""
    exam = db_session.query(Exam).first()
    create_res = client.post(
        "/api/sessions",
        json={
            "exam_id": exam.id,
            "candidate_name": "Carol Flagged",
            "candidate_id": "CAND-TERM-01"
        }
    )
    session_id = create_res.json()["id"]

    # 1. Get Report
    rep_res = client.get(f"/api/examiner/sessions/{session_id}/report?auth_code=TEACHER-UNLOCK-2026")
    assert rep_res.status_code == 200
    report = rep_res.json()
    assert report["candidate"]["name"] == "Carol Flagged"
    assert "integrity_summary" in report
    assert "events_timeline" in report

    # 2. Terminate session
    term_res = client.post(
        f"/api/examiner/sessions/{session_id}/terminate?auth_code=TEACHER-UNLOCK-2026",
        json={
            "reason": "Severe unauthorized material detected",
            "proctor_id": "LEAD-PROCTOR-01"
        }
    )
    assert term_res.status_code == 200
    assert term_res.json()["status"] == "terminated"

    # Verify session is now locked
    sess_check = client.get(f"/api/examiner/sessions/{session_id}?auth_code=TEACHER-UNLOCK-2026")
    assert sess_check.json()["session"]["is_locked"] == 1
    assert sess_check.json()["session"]["status"] == "locked"
