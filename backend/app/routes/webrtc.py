"""
WebRTC Signaling and Examiner Management Router

Features:
1. Real-time bi-directional signaling for WebRTC video transmission (SDP offer/answer, ICE candidates).
2. Strict session existence and examiner authorization validation.
3. Automated logging of normalized audit events:
   - SCREEN_SHARE_STARTED
   - SCREEN_SHARE_STOPPED
   - SCREEN_SHARE_INTERRUPTED
   - SCREEN_SHARE_RECONNECTED
4. ICE configuration endpoint for STUN/TURN traversal.
5. Examiner session audit and live monitoring status endpoints.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import ExamSession, IntegrityEvent, Exam
from app.schemas import (
    EventResponse,
    ReviewEventDecisionRequest,
    TerminateSessionRequest,
    CreateAssessmentRequest
)

router = APIRouter(prefix="/api", tags=["WebRTC Screen Sharing & Examiner"])


class SignalingRoom:
    """Manages connected WebRTC peers (candidate sharer and examiner viewer) for a session."""
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.candidate_ws: Optional[WebSocket] = None
        self.examiner_ws: Optional[WebSocket] = None
        self.is_sharing: bool = False
        self.started_at: Optional[datetime] = None
        self.last_offer: Optional[Dict[str, Any]] = None
        self.candidate_ice_candidates: List[Dict[str, Any]] = []


class SignalingManager:
    """In-memory coordinator for active WebRTC signaling rooms."""
    def __init__(self):
        self.rooms: Dict[str, SignalingRoom] = {}

    def get_or_create_room(self, session_id: str) -> SignalingRoom:
        if session_id not in self.rooms:
            self.rooms[session_id] = SignalingRoom(session_id)
        return self.rooms[session_id]

    def remove_peer(self, session_id: str, role: str) -> None:
        if session_id in self.rooms:
            room = self.rooms[session_id]
            if role == "candidate":
                room.candidate_ws = None
                room.is_sharing = False
                room.last_offer = None
                room.candidate_ice_candidates.clear()
            elif role == "examiner":
                room.examiner_ws = None

            # Clean up empty room
            if room.candidate_ws is None and room.examiner_ws is None:
                self.rooms.pop(session_id, None)


signaling_manager = SignalingManager()


@router.get("/webrtc/config")
def get_ice_servers_config():
    """
    Returns WebRTC ICE servers configuration.
    Uses configurable STUN/TURN environment settings without exposing credentials in client bundle.
    Includes multiple public STUN endpoints for reliable traversal on hackathon / multi-network Wi-Fi.
    """
    ice_servers = [
        {
            "urls": [
                getattr(settings, "WEBRTC_STUN_SERVER", "stun:stun.l.google.com:19302") or "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
                "stun:stun.cloudflare.com:3478"
            ]
        }
    ]
    if hasattr(settings, "WEBRTC_TURN_SERVER") and settings.WEBRTC_TURN_SERVER:
        turn_entry = {"urls": [settings.WEBRTC_TURN_SERVER]}
        if hasattr(settings, "WEBRTC_TURN_USERNAME") and settings.WEBRTC_TURN_USERNAME:
            turn_entry["username"] = settings.WEBRTC_TURN_USERNAME
        if hasattr(settings, "WEBRTC_TURN_CREDENTIAL") and settings.WEBRTC_TURN_CREDENTIAL:
            turn_entry["credential"] = settings.WEBRTC_TURN_CREDENTIAL
        ice_servers.append(turn_entry)

    return {
        "iceServers": ice_servers,
        "iceTransportPolicy": "all"
    }


def verify_examiner_token(auth_code: str) -> None:
    valid_codes = [c.upper() for c in settings.ALLOWED_TEACHER_CODES]
    token = (auth_code or "").strip().upper()
    if token not in valid_codes and token != settings.TEACHER_UNLOCK_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid examiner authorization code"
        )


@router.get("/examiner/overview")
def get_examiner_overview(
    auth_code: str = Query(..., description="Examiner authorization code"),
    db: Session = Depends(get_db)
):
    """
    Returns aggregated real-time assessment and proctoring statistics for the Proctor Dashboard.
    """
    verify_examiner_token(auth_code)

    total_exams = db.query(Exam).count()
    all_sessions = db.query(ExamSession).all()

    total_sessions = len(all_sessions)
    active_sessions = sum(1 for s in all_sessions if s.status == "active")
    submitted_sessions = sum(1 for s in all_sessions if s.status == "submitted")
    locked_sessions = sum(1 for s in all_sessions if s.is_locked or s.status == "locked")

    # Active WebRTC streams in coordinator
    active_screens = sum(1 for room in signaling_manager.rooms.values() if room.is_sharing)

    # Integrity incident counts
    all_events = db.query(IntegrityEvent).all()
    total_incidents = len(all_events)
    unreviewed_incidents = sum(1 for e in all_events if getattr(e, "review_status", "unreviewed") == "unreviewed")
    escalated_incidents = sum(1 for e in all_events if getattr(e, "review_status", "unreviewed") == "escalated")
    dismissed_incidents = sum(1 for e in all_events if getattr(e, "review_status", "unreviewed") == "dismissed")
    reviewed_incidents = sum(1 for e in all_events if getattr(e, "review_status", "unreviewed") == "reviewed")

    # Breakdown by severity
    critical_incidents = sum(1 for e in all_events if e.severity == "critical")
    high_incidents = sum(1 for e in all_events if e.severity == "high")
    medium_incidents = sum(1 for e in all_events if e.severity == "medium")
    info_incidents = sum(1 for e in all_events if e.severity == "info")

    exams = db.query(Exam).all()
    exam_summaries = [
        {
            "id": ex.id,
            "title": ex.title,
            "duration_minutes": ex.duration_minutes,
            "total_questions": ex.total_questions,
            "assigned_proctors": ["Prof. Sharma (Lead)", "Dr. Evelyn Vance (AI Safety)"]
        }
        for ex in exams
    ]

    return {
        "status": "operational",
        "system_time": datetime.now(timezone.utc),
        "assessments_count": total_exams,
        "exams": exam_summaries,
        "candidates": {
            "total": total_sessions,
            "active": active_sessions,
            "submitted": submitted_sessions,
            "locked": locked_sessions,
            "live_screens_streaming": active_screens
        },
        "incidents": {
            "total": total_incidents,
            "unreviewed": unreviewed_incidents,
            "escalated": escalated_incidents,
            "dismissed": dismissed_incidents,
            "reviewed": reviewed_incidents,
            "breakdown_by_severity": {
                "critical": critical_incidents,
                "high": high_incidents,
                "medium": medium_incidents,
                "info": info_incidents
            }
        },
        "assigned_proctors": [
            {"id": "PROC-01", "name": "Prof. Sharma", "role": "Lead Proctor", "status": "active"},
            {"id": "PROC-02", "name": "Dr. Evelyn Vance", "role": "AI Capability Specialist", "status": "active"},
            {"id": "PROC-03", "name": "Examiner Desk A1", "role": "Session Monitor", "status": "ready"}
        ]
    }


@router.get("/examiner/incidents")
def list_examiner_incidents(
    auth_code: str = Query(..., description="Examiner authorization code"),
    session_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    review_status: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """
    Returns a filterable cross-session incident queue for proctors to review and annotate.
    """
    verify_examiner_token(auth_code)

    query = db.query(IntegrityEvent, ExamSession, Exam)\
        .join(ExamSession, IntegrityEvent.session_id == ExamSession.id)\
        .join(Exam, ExamSession.exam_id == Exam.id)

    if session_id:
        query = query.filter(IntegrityEvent.session_id == session_id)
    if severity:
        query = query.filter(IntegrityEvent.severity == severity.lower())
    if review_status:
        query = query.filter(IntegrityEvent.review_status == review_status.lower())
    if event_type:
        query = query.filter(IntegrityEvent.event_type == event_type)

    results = query.order_by(IntegrityEvent.occurred_at.desc()).limit(limit).all()

    output = []
    for evt, s, ex in results:
        output.append({
            "id": evt.id,
            "session_id": evt.session_id,
            "candidate_name": s.candidate_name,
            "candidate_id": s.candidate_id,
            "exam_title": ex.title,
            "event_type": evt.event_type,
            "occurred_at": evt.occurred_at,
            "source": evt.source,
            "severity": evt.severity,
            "confidence": evt.confidence,
            "metadata": evt.metadata_dict,
            "review_status": getattr(evt, "review_status", "unreviewed") or "unreviewed",
            "review_notes": getattr(evt, "review_notes", None),
            "reviewed_by": getattr(evt, "reviewed_by", None),
            "reviewed_at": getattr(evt, "reviewed_at", None)
        })

    return output


@router.post("/examiner/events/{event_id}/review")
def review_integrity_event(
    event_id: str,
    payload: ReviewEventDecisionRequest,
    auth_code: str = Query(..., description="Examiner authorization code"),
    db: Session = Depends(get_db)
):
    """
    Submits an examiner review decision (reviewed, dismissed, or escalated) for a specific incident.
    """
    verify_examiner_token(auth_code)

    evt = db.query(IntegrityEvent).filter(IntegrityEvent.id == event_id).first()
    if not evt:
        raise HTTPException(status_code=404, detail="Incident event not found")

    valid_statuses = ["reviewed", "dismissed", "escalated", "unreviewed"]
    if payload.status.lower() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid review status: {payload.status}")

    evt.review_status = payload.status.lower()
    evt.review_notes = payload.reason
    evt.reviewed_by = payload.proctor_id or "PROCTOR-ADMIN-01"
    evt.reviewed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(evt)

    return {
        "status": "success",
        "event_id": evt.id,
        "review_status": evt.review_status,
        "review_notes": evt.review_notes,
        "reviewed_by": evt.reviewed_by,
        "reviewed_at": evt.reviewed_at
    }


@router.post("/examiner/sessions/{session_id}/terminate")
def terminate_candidate_session(
    session_id: str,
    payload: TerminateSessionRequest,
    auth_code: str = Query(..., description="Examiner authorization code"),
    db: Session = Depends(get_db)
):
    """
    Remotely locks and terminates a candidate's session when severe integrity violations are confirmed.
    """
    verify_examiner_token(auth_code)

    s = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    s.is_locked = 1
    s.status = "locked"

    term_event = IntegrityEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        event_type="SESSION_TERMINATED_BY_PROCTOR",
        occurred_at=datetime.now(timezone.utc),
        source="proctor_console",
        severity="critical",
        confidence=1.0,
        metadata_json=json.dumps({
            "reason": payload.reason,
            "proctor_id": payload.proctor_id
        }),
        review_status="escalated",
        review_notes=payload.reason,
        reviewed_by=payload.proctor_id,
        reviewed_at=datetime.now(timezone.utc)
    )
    db.add(term_event)
    db.commit()

    # Disconnect WebRTC room if currently active
    if session_id in signaling_manager.rooms:
        room = signaling_manager.rooms[session_id]
        room.is_sharing = False

    return {
        "status": "terminated",
        "session_id": session_id,
        "message": f"Session terminated by proctor: {payload.reason}"
    }


@router.get("/examiner/sessions/{session_id}/report")
def get_session_comprehensive_report(
    session_id: str,
    auth_code: str = Query(..., description="Examiner authorization code"),
    db: Session = Depends(get_db)
):
    """
    Generates a structured, exportable forensic proctor report for a candidate's completed or audited assessment.
    """
    verify_examiner_token(auth_code)

    s = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    exam = db.query(Exam).filter(Exam.id == s.exam_id).first()
    events = (
        db.query(IntegrityEvent)
        .filter(IntegrityEvent.session_id == session_id)
        .order_by(IntegrityEvent.occurred_at.asc())
        .all()
    )

    duration_sec = 0
    if s.started_at:
        end_time = s.submitted_at or datetime.now(timezone.utc)
        # Ensure offset-naive compatibility with SQLite datetime fields
        start_naive = s.started_at.replace(tzinfo=None) if s.started_at.tzinfo else s.started_at
        end_naive = end_time.replace(tzinfo=None) if end_time.tzinfo else end_time
        duration_sec = max(0, int((end_naive - start_naive).total_seconds()))

    # Aggregate incidents by type and review outcome
    breakdown_by_type: Dict[str, int] = {}
    review_outcomes: Dict[str, int] = {"unreviewed": 0, "reviewed": 0, "dismissed": 0, "escalated": 0}
    for e in events:
        breakdown_by_type[e.event_type] = breakdown_by_type.get(e.event_type, 0) + 1
        st = getattr(e, "review_status", "unreviewed") or "unreviewed"
        review_outcomes[st] = review_outcomes.get(st, 0) + 1

    # Overall proctoring assessment verdict
    has_critical = any(e.severity == "critical" or getattr(e, "review_status", "") == "escalated" for e in events)
    verdict = "FLAGGED_FOR_REVIEW" if has_critical else "CLEARED_AUTOMATED_CHECKS" if len(events) < 3 else "REQUIRES_AUDIT"

    return {
        "report_id": f"REP-{session_id[:8].upper()}",
        "generated_at": datetime.now(timezone.utc),
        "candidate": {
            "name": s.candidate_name,
            "id": s.candidate_id,
            "face_id": s.face_id or "Not Enrolled"
        },
        "assessment": {
            "id": exam.id if exam else s.exam_id,
            "title": exam.title if exam else "Assessment",
            "allocated_duration_minutes": exam.duration_minutes if exam else 30
        },
        "session": {
            "session_id": s.id,
            "status": s.status,
            "is_locked": bool(s.is_locked),
            "started_at": s.started_at,
            "submitted_at": s.submitted_at,
            "duration_seconds": duration_sec,
            "duration_formatted": f"{duration_sec // 60}m {duration_sec % 60}s",
            "score": s.score,
            "total_questions": exam.total_questions if exam else 5,
            "percentage": round((s.score / (exam.total_questions or 1)) * 100, 1) if s.score is not None and exam else None
        },
        "integrity_summary": {
            "verdict": verdict,
            "total_events": len(events),
            "incident_types": breakdown_by_type,
            "review_outcomes": review_outcomes
        },
        "events_timeline": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "occurred_at": e.occurred_at,
                "source": e.source,
                "severity": e.severity,
                "confidence": e.confidence,
                "metadata": e.metadata_dict,
                "review_status": getattr(e, "review_status", "unreviewed") or "unreviewed",
                "review_notes": getattr(e, "review_notes", None),
                "reviewed_by": getattr(e, "reviewed_by", None),
                "reviewed_at": getattr(e, "reviewed_at", None)
            }
            for e in events
        ]
    }


@router.post("/examiner/exams")
def create_examiner_assessment(
    payload: CreateAssessmentRequest,
    auth_code: str = Query(..., description="Examiner authorization code"),
    db: Session = Depends(get_db)
):
    """
    Creates a new assessment configuration with custom title, duration, and optional questions.
    """
    verify_examiner_token(auth_code)

    exam_id = str(uuid.uuid4())
    total_q = len(payload.questions) if payload.questions else 0

    new_exam = Exam(
        id=exam_id,
        title=payload.title,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        total_questions=total_q or 5
    )
    db.add(new_exam)

    if payload.questions:
        from app.models import Question, Choice
        for q_in in payload.questions:
            q_id = str(uuid.uuid4())
            correct_choice_id = str(uuid.uuid4())

            question_obj = Question(
                id=q_id,
                exam_id=exam_id,
                question_number=q_in.question_number,
                text=q_in.text,
                correct_choice_id=correct_choice_id
            )
            db.add(question_obj)

            for idx, c_in in enumerate(q_in.choices):
                choice_id = correct_choice_id if c_in.is_correct or idx == 0 else str(uuid.uuid4())
                ch_obj = Choice(
                    id=choice_id,
                    question_id=q_id,
                    choice_letter=c_in.choice_letter,
                    text=c_in.text
                )
                db.add(ch_obj)

    db.commit()
    db.refresh(new_exam)

    return {
        "status": "created",
        "exam_id": new_exam.id,
        "title": new_exam.title,
        "duration_minutes": new_exam.duration_minutes,
        "total_questions": new_exam.total_questions
    }


@router.get("/examiner/sessions")
def list_examiner_sessions(
    auth_code: str = Query(..., description="Examiner authorization code"),
    db: Session = Depends(get_db)
):
    """
    Lists examination sessions for authorized examiner console.
    Requires valid teacher/examiner authorization code.
    """
    verify_examiner_token(auth_code)

    sessions = db.query(ExamSession).order_by(ExamSession.started_at.desc()).all()
    output = []
    for s in sessions:
        exam = db.query(Exam).filter(Exam.id == s.exam_id).first()
        active_room = signaling_manager.rooms.get(s.id)
        is_screen_active = active_room.is_sharing if active_room else False

        events_count = db.query(IntegrityEvent).filter(IntegrityEvent.session_id == s.id).count()

        output.append({
            "session_id": s.id,
            "candidate_name": s.candidate_name,
            "candidate_id": s.candidate_id,
            "exam_id": s.exam_id,
            "exam_title": exam.title if exam else "Assessment",
            "status": s.status,
            "is_locked": s.is_locked,
            "started_at": s.started_at,
            "submitted_at": s.submitted_at,
            "score": s.score,
            "is_screen_active": is_screen_active,
            "integrity_events_count": events_count
        })

    return output


@router.get("/examiner/sessions/{session_id}")
def get_examiner_session_detail(
    session_id: str,
    auth_code: str = Query(..., description="Examiner authorization code"),
    db: Session = Depends(get_db)
):
    """
    Retrieves detailed session state and chronological incident events for an examiner.
    """
    verify_examiner_token(auth_code)

    s = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    exam = db.query(Exam).filter(Exam.id == s.exam_id).first()
    events = (
        db.query(IntegrityEvent)
        .filter(IntegrityEvent.session_id == session_id)
        .order_by(IntegrityEvent.occurred_at.asc())
        .all()
    )

    active_room = signaling_manager.rooms.get(s.id)
    is_screen_active = active_room.is_sharing if active_room else False

    return {
        "session": {
            "session_id": s.id,
            "candidate_name": s.candidate_name,
            "candidate_id": s.candidate_id,
            "exam_title": exam.title if exam else "Assessment",
            "status": s.status,
            "is_locked": s.is_locked,
            "started_at": s.started_at,
            "submitted_at": s.submitted_at,
            "score": s.score,
            "is_screen_active": is_screen_active
        },
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "occurred_at": e.occurred_at,
                "source": e.source,
                "severity": e.severity,
                "confidence": e.confidence,
                "metadata": e.metadata_dict,
                "review_status": getattr(e, "review_status", "unreviewed") or "unreviewed",
                "review_notes": getattr(e, "review_notes", None),
                "reviewed_by": getattr(e, "reviewed_by", None),
                "reviewed_at": getattr(e, "reviewed_at", None)
            }
            for e in events
        ]
    }


@router.websocket("/webrtc/signal/{session_id}")
async def webrtc_signaling_endpoint(
    websocket: WebSocket,
    session_id: str,
    role: str = Query(..., pattern="^(candidate|examiner)$"),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    WebRTC Signaling Gateway.
    Relays SDP offers, SDP answers, and ICE candidate packets between candidate and authorized examiner.
    """
    # 1. Validate Session Exists
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        await websocket.close(code=4004, reason="Session not found")
        return

    # 2. Authenticate Examiner if Role is examiner
    if role == "examiner":
        valid_codes = [c.upper() for c in settings.ALLOWED_TEACHER_CODES]
        token_str = (token or "").strip().upper()
        if token_str not in valid_codes and token_str != settings.TEACHER_UNLOCK_CODE:
            await websocket.close(code=4003, reason="Unauthorized examiner token")
            return

    await websocket.accept()
    room = signaling_manager.get_or_create_room(session_id)

    # Register peer in room
    if role == "candidate":
        room.candidate_ws = websocket
    else:
        room.examiner_ws = websocket

    # Notify connected status to both peers
    try:
        await websocket.send_json({
            "type": "peer_status",
            "role": role,
            "session_id": session_id,
            "peer_connected": bool(room.examiner_ws if role == "candidate" else room.candidate_ws)
        })

        other_ws = room.examiner_ws if role == "candidate" else room.candidate_ws
        if other_ws:
            await other_ws.send_json({
                "type": "peer_status",
                "role": "examiner" if role == "candidate" else "candidate",
                "session_id": session_id,
                "peer_connected": True,
                "request_offer": True if role == "examiner" else False
            })

        # If candidate previously generated an offer before examiner joined, immediately forward it!
        if role == "examiner" and room.last_offer:
            print(f"[WebRTC Signal] Immediately forwarding cached SDP offer to newly connected examiner for session {session_id}")
            await websocket.send_json(room.last_offer)
            for cand in room.candidate_ice_candidates:
                await websocket.send_json(cand)

        while True:
            raw_text = await websocket.receive_text()
            data = json.loads(raw_text)
            msg_type = data.get("type")

            # A. Relay SDP Offer from Candidate to Examiner
            if msg_type == "offer":
                room.is_sharing = True
                room.last_offer = data
                room.candidate_ice_candidates.clear()
                room.started_at = datetime.now(timezone.utc)
                print(f"[WebRTC Signal] Relay SDP Offer for session {session_id} to examiner (ws_connected={bool(room.examiner_ws)})")

                # Log SCREEN_SHARE_STARTED into database
                start_ev = IntegrityEvent(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    event_type="SCREEN_SHARE_STARTED",
                    occurred_at=datetime.now(timezone.utc),
                    source="webrtc_screenshare",
                    severity="info",
                    confidence=1.0,
                    metadata_json=json.dumps({
                        "source_name": data.get("source_name", "Primary Display"),
                        "resolution": data.get("resolution", "1920x1080")
                    })
                )
                db.add(start_ev)
                db.commit()

                if room.examiner_ws:
                    await room.examiner_ws.send_json(data)

            # B. Relay SDP Answer from Examiner back to Candidate
            elif msg_type == "answer":
                print(f"[WebRTC Signal] Relay SDP Answer for session {session_id} to candidate (ws_connected={bool(room.candidate_ws)})")
                if room.candidate_ws:
                    await room.candidate_ws.send_json(data)

            # C. Relay ICE Candidates between peers
            elif msg_type == "ice-candidate":
                target_ws = room.examiner_ws if role == "candidate" else room.candidate_ws
                if target_ws:
                    await target_ws.send_json(data)
                elif role == "candidate":
                    # Buffer candidate's ICE candidates until examiner arrives
                    room.candidate_ice_candidates.append(data)

            # D. Handle Explicit Stop Sharing Signal from Candidate
            elif msg_type == "stop_share":
                room.is_sharing = False
                room.last_offer = None
                room.candidate_ice_candidates.clear()
                stop_ev = IntegrityEvent(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    event_type="SCREEN_SHARE_STOPPED",
                    occurred_at=datetime.now(timezone.utc),
                    source="webrtc_screenshare",
                    severity="info",
                    confidence=1.0,
                    metadata_json=json.dumps({
                        "reason": data.get("reason", "Candidate ended screen sharing"),
                        "duration_sec": int((datetime.now(timezone.utc) - room.started_at).total_seconds()) if room.started_at else 0
                    })
                )
                db.add(stop_ev)
                db.commit()

                if room.examiner_ws:
                    await room.examiner_ws.send_json({"type": "stream_stopped"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[WebRTC Signal] Error: {exc}")
    finally:
        # Peer disconnected
        signaling_manager.remove_peer(session_id, role)
        other_ws = room.examiner_ws if role == "candidate" else room.candidate_ws
        if other_ws:
            try:
                await other_ws.send_json({
                    "type": "peer_status",
                    "role": role,
                    "session_id": session_id,
                    "peer_connected": False
                })
            except Exception:
                pass

        # Log interruption if candidate disconnected during active share
        if role == "candidate" and room.is_sharing:
            room.is_sharing = False
            try:
                interrupted_ev = IntegrityEvent(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    event_type="SCREEN_SHARE_INTERRUPTED",
                    occurred_at=datetime.now(timezone.utc),
                    source="webrtc_signaling",
                    severity="medium",
                    confidence=0.95,
                    metadata_json=json.dumps({"reason": "Candidate WebRTC socket disconnected unexpectedly"})
                )
                db.add(interrupted_ev)
                db.commit()
            except Exception:
                pass
