import uuid
import json
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Exam, Question, ExamSession, CandidateAnswer, IntegrityEvent
from app.schemas import (
    CreateSessionRequest,
    SessionResponse,
    SaveAnswerRequest,
    AnswerResponse,
    LogEventRequest,
    EventResponse,
    AnalyzeFrameRequest,
    AnalyzeFrameResponse,
    SubmitSessionResponse
)
from app.proctoring import analyze_camera_frame

router = APIRouter(prefix="/api", tags=["Sessions & Proctoring"])


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(payload: CreateSessionRequest, db: Session = Depends(get_db)):
    """Initialize a monitored examination session for a candidate."""
    exam = db.query(Exam).filter(Exam.id == payload.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Assessment not found")

    session_id = str(uuid.uuid4())
    exam_session = ExamSession(
        id=session_id,
        exam_id=exam.id,
        candidate_name=payload.candidate_name,
        candidate_id=payload.candidate_id,
        status="active",
        started_at=datetime.now(timezone.utc)
    )
    db.add(exam_session)

    # Log initial session start event
    start_event = IntegrityEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        event_type="SESSION_STARTED",
        source="system",
        severity="info",
        confidence=1.0,
        metadata_json=json.dumps({"candidate_name": payload.candidate_name, "exam_title": exam.title})
    )
    db.add(start_event)
    db.commit()
    db.refresh(exam_session)

    return SessionResponse(
        id=exam_session.id,
        exam_id=exam_session.exam_id,
        candidate_name=exam_session.candidate_name,
        candidate_id=exam_session.candidate_id,
        status=exam_session.status,
        started_at=exam_session.started_at,
        duration_minutes=exam.duration_minutes
    )


@router.put("/sessions/{session_id}/answers/{question_id}", response_model=AnswerResponse)
def save_answer(
    session_id: str,
    question_id: str,
    payload: SaveAnswerRequest,
    db: Session = Depends(get_db)
):
    """Save or update candidate's selected choice for an MCQ question."""
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session or exam_session.status != "active":
        raise HTTPException(status_code=400, detail="Active exam session not found")

    # Check if answer record exists
    answer = db.query(CandidateAnswer).filter(
        CandidateAnswer.session_id == session_id,
        CandidateAnswer.question_id == question_id
    ).first()

    if not answer:
        answer = CandidateAnswer(
            id=str(uuid.uuid4()),
            session_id=session_id,
            question_id=question_id,
            selected_choice_id=payload.selected_choice_id,
            saved_at=datetime.now(timezone.utc)
        )
        db.add(answer)
    else:
        answer.selected_choice_id = payload.selected_choice_id
        answer.saved_at = datetime.now(timezone.utc)

    db.commit()
    return AnswerResponse(
        status="saved",
        question_id=question_id,
        selected_choice_id=payload.selected_choice_id
    )


@router.post("/sessions/{session_id}/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def log_integrity_event(
    session_id: str,
    payload: LogEventRequest,
    db: Session = Depends(get_db)
):
    """Log a security or behavioral integrity telemetry event."""
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    event = IntegrityEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        event_type=payload.event_type,
        occurred_at=datetime.now(timezone.utc),
        source=payload.source,
        severity=payload.severity,
        confidence=payload.confidence,
        metadata_json=json.dumps(payload.metadata or {})
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return EventResponse(
        id=event.id,
        session_id=event.session_id,
        event_type=event.event_type,
        occurred_at=event.occurred_at,
        source=event.source,
        severity=event.severity,
        confidence=event.confidence,
        metadata=event.metadata_dict
    )


@router.get("/sessions/{session_id}/events", response_model=List[EventResponse])
def get_session_events(session_id: str, db: Session = Depends(get_db)):
    """Retrieve full chronological integrity audit trail for an assessment session."""
    events = (
        db.query(IntegrityEvent)
        .filter(IntegrityEvent.session_id == session_id)
        .order_by(IntegrityEvent.occurred_at.asc())
        .all()
    )
    return [
        EventResponse(
            id=e.id,
            session_id=e.session_id,
            event_type=e.event_type,
            occurred_at=e.occurred_at,
            source=e.source,
            severity=e.severity,
            confidence=e.confidence,
            metadata=e.metadata_dict
        )
        for e in events
    ]


@router.post("/proctor/analyze-frame", response_model=AnalyzeFrameResponse)
def analyze_frame(payload: AnalyzeFrameRequest, db: Session = Depends(get_db)):
    """
    Real-time Computer Vision proctoring analysis.
    Uses OpenCV to inspect candidate webcam frames for face presence and count.
    Automatically logs an anomaly event if session_id is provided and anomaly detected.
    """
    analysis = analyze_camera_frame(payload.image_base64)

    # If linked to an active session, auto-log anomalous signals
    if payload.session_id:
        exam_session = db.query(ExamSession).filter(ExamSession.id == payload.session_id).first()
        if exam_session and exam_session.status == "active":
            if analysis["status"] == "no_face":
                event = IntegrityEvent(
                    id=str(uuid.uuid4()),
                    session_id=payload.session_id,
                    event_type="NO_FACE_DETECTED",
                    occurred_at=datetime.now(timezone.utc),
                    source="opencv_cv_engine",
                    severity="high",
                    confidence=analysis["confidence"],
                    metadata_json=json.dumps({"reason": "Candidate not visible in webcam frame"})
                )
                db.add(event)
                db.commit()
            elif analysis["status"] == "multiple_faces":
                event = IntegrityEvent(
                    id=str(uuid.uuid4()),
                    session_id=payload.session_id,
                    event_type="MULTIPLE_FACES_DETECTED",
                    occurred_at=datetime.now(timezone.utc),
                    source="opencv_cv_engine",
                    severity="critical",
                    confidence=analysis["confidence"],
                    metadata_json=json.dumps({
                        "face_count": analysis["face_count"],
                        "reason": "Multiple individuals detected in proctoring feed"
                    })
                )
                db.add(event)
                db.commit()

    return AnalyzeFrameResponse(
        face_detected=analysis["face_detected"],
        face_count=analysis["face_count"],
        confidence=analysis["confidence"],
        status=analysis["status"],
        bounding_boxes=analysis["bounding_boxes"]
    )


@router.post("/sessions/{session_id}/submit", response_model=SubmitSessionResponse)
def submit_session(session_id: str, db: Session = Depends(get_db)):
    """
    Finalize examination session.
    Computes candidate score securely on backend against private Question.correct_choice_id.
    Compiles integrity summary and audit timeline.
    """
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    exam = db.query(Exam).filter(Exam.id == exam_session.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    questions = db.query(Question).filter(Question.exam_id == exam.id).all()
    correct_map = {q.id: q.correct_choice_id for q in questions}

    answers = db.query(CandidateAnswer).filter(CandidateAnswer.session_id == session_id).all()
    score = 0
    for ans in answers:
        if ans.question_id in correct_map and ans.selected_choice_id == correct_map[ans.question_id]:
            score += 1

    exam_session.status = "submitted"
    exam_session.score = score
    exam_session.submitted_at = datetime.now(timezone.utc)

    # Log completion event
    completion_event = IntegrityEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        event_type="SESSION_SUBMITTED",
        source="system",
        severity="info",
        confidence=1.0,
        metadata_json=json.dumps({"score": score, "total_questions": len(questions)})
    )
    db.add(completion_event)
    db.commit()

    # Compile events summary
    events = (
        db.query(IntegrityEvent)
        .filter(IntegrityEvent.session_id == session_id)
        .order_by(IntegrityEvent.occurred_at.asc())
        .all()
    )
    summary: dict = {}
    for ev in events:
        summary[ev.event_type] = summary.get(ev.event_type, 0) + 1

    total_q = len(questions) or 1
    percentage = round((score / total_q) * 100, 1)

    return SubmitSessionResponse(
        session_id=session_id,
        status="submitted",
        score=score,
        total_questions=len(questions),
        percentage=percentage,
        submitted_at=exam_session.submitted_at,
        events_summary=summary,
        events=[
            EventResponse(
                id=e.id,
                session_id=e.session_id,
                event_type=e.event_type,
                occurred_at=e.occurred_at,
                source=e.source,
                severity=e.severity,
                confidence=e.confidence,
                metadata=e.metadata_dict
            )
            for e in events
        ]
    )
