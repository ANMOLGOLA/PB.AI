import uuid
import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.config import settings
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
    PreExamScanRequest,
    PreExamScanResponse,
    EnrollFaceRequest,
    EnrollFaceResponse,
    TeacherUnlockRequest,
    TeacherUnlockResponse,
    SubmitSessionResponse
)
from app.proctoring import analyze_camera_frame

router = APIRouter(prefix="/api", tags=["Sessions & Proctoring"])


@router.get("/config/groq-status")
def get_groq_status():
    """Check if Groq Multimodal Vision API is configured and ready."""
    return {
        "groq_configured": bool(settings.GROQ_API_KEY),
        "model": settings.GROQ_VISION_MODEL
    }


@router.post("/config/groq-key")
def configure_groq_key(payload: dict):
    """Dynamically set or update Groq API key for vision proctoring."""
    key = payload.get("api_key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key is required")
    settings.GROQ_API_KEY = key
    return {
        "status": "ok",
        "message": "Groq API Key configured successfully. Vision proctoring is active.",
        "groq_configured": True,
        "model": settings.GROQ_VISION_MODEL
    }


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
        face_id=payload.face_id,
        face_signature=payload.face_signature,
        is_locked=0,
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
        metadata_json=json.dumps({
            "candidate_name": payload.candidate_name,
            "candidate_id": payload.candidate_id,
            "exam_title": exam.title,
            "face_id": payload.face_id
        })
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
        face_id=exam_session.face_id,
        is_locked=exam_session.is_locked,
        started_at=exam_session.started_at,
        duration_minutes=exam.duration_minutes
    )


@router.post("/proctor/pre-exam-scan", response_model=PreExamScanResponse)
def pre_exam_scan(payload: PreExamScanRequest):
    """
    Performs pre-exam candidate biometric identity enrollment and environment inspection.
    Scans for:
      1. Centered single face for Face ID biometric token generation.
      2. Prohibited mobile phones or foreign devices in frame.
      3. Prohibited dark sunglasses / tinted eyewear.
    """
    analysis = analyze_camera_frame(payload.image_base64)
    face_count = analysis.get("face_count", 0)
    eyewear_detected = analysis.get("eyewear_detected", False)
    phone_detected = analysis.get("phone_detected", False)

    face_sig = analysis.get("face_signature") or {}
    face_id = face_sig.get("face_id", f"FID-{uuid.uuid4().hex[:8].upper()}")

    issues = []
    if face_count == 0:
        issues.append("No face detected. Please position face clearly in camera.")
    elif face_count > 1:
        issues.append("Multiple faces detected in frame.")
    if eyewear_detected:
        issues.append("Tinted eyewear or sunglasses detected. Please remove them.")
    if phone_detected:
        issues.append("Unauthorized mobile phone or foreign object detected in frame. Please put all devices away.")

    all_passed = len(issues) == 0
    details = "Biometric Face ID registered and environment clear." if all_passed else " | ".join(issues)

    return PreExamScanResponse(
        face_detected=face_count > 0,
        face_count=face_count,
        face_id=face_id,
        eyewear_detected=eyewear_detected,
        phone_detected=phone_detected,
        all_passed=all_passed,
        details=details,
        face_signature_json=json.dumps(face_sig) if face_sig else None
    )


@router.post("/sessions/{session_id}/enroll-face", response_model=EnrollFaceResponse)
def enroll_candidate_face(
    session_id: str,
    payload: EnrollFaceRequest,
    db: Session = Depends(get_db)
):
    """Enroll candidate's unique biometric Face ID signature into their active session."""
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    analysis = analyze_camera_frame(payload.image_base64)
    if not analysis["face_detected"] or analysis["face_count"] != 1:
        raise HTTPException(
            status_code=400,
            detail=f"Single clear face required for Face ID enrollment (detected {analysis['face_count']})"
        )

    face_sig = analysis.get("face_signature") or {}
    face_id = face_sig.get("face_id", f"FID-{uuid.uuid4().hex[:8].upper()}")

    exam_session.face_id = face_id
    exam_session.face_signature = json.dumps(face_sig)

    enroll_event = IntegrityEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        event_type="FACE_ID_ENROLLED",
        source="mediapipe_biometrics",
        severity="info",
        confidence=0.99,
        metadata_json=json.dumps({
            "face_id": face_id,
            "candidate_name": exam_session.candidate_name,
            "status": "enrolled"
        })
    )
    db.add(enroll_event)
    db.commit()

    return EnrollFaceResponse(
        face_id=face_id,
        status="enrolled",
        confidence=0.99,
        message="Candidate Face ID successfully enrolled for anti-impersonation monitoring."
    )


@router.post("/sessions/{session_id}/unlock", response_model=TeacherUnlockResponse)
def unlock_session(
    session_id: str,
    payload: TeacherUnlockRequest,
    db: Session = Depends(get_db)
):
    """
    Teacher/Proctor override authorization.
    Unlocks an assessment session locked out after 5 integrity warnings.
    Accepts teacher authorization code (e.g., TEACHER-UNLOCK-2026, ELEV8-2026).
    """
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    code_entered = payload.teacher_code.strip()
    valid_codes = [c.upper() for c in settings.ALLOWED_TEACHER_CODES]

    if code_entered.upper() not in valid_codes and code_entered != settings.TEACHER_UNLOCK_CODE:
        # Log unauthorized attempt
        fail_event = IntegrityEvent(
            id=str(uuid.uuid4()),
            session_id=session_id,
            event_type="UNAUTHORIZED_UNLOCK_ATTEMPT",
            source="teacher_lockout_guard",
            severity="high",
            confidence=1.0,
            metadata_json=json.dumps({"attempted_code": code_entered})
        )
        db.add(fail_event)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid teacher authorization code. Access denied."
        )

    # Unlock session
    exam_session.is_locked = 0
    unlock_event = IntegrityEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        event_type="TEACHER_UNLOCK_OVERRIDE",
        source="teacher_lockout_guard",
        severity="info",
        confidence=1.0,
        metadata_json=json.dumps({
            "authorized_by": "TEACHER_OVERRIDE",
            "message": "Teacher provided valid authorization code; candidate assessment access restored."
        })
    )
    db.add(unlock_event)
    db.commit()

    return TeacherUnlockResponse(
        unlocked=True,
        session_id=session_id,
        message="Assessment access successfully restored by teacher authorization."
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

    if exam_session.is_locked:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Exam session locked due to integrity violations. Contact proctor."
        )

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
    Uses MediaPipe deep-learning BlazeFace to inspect candidate webcam frames for:
      - Face presence & count
      - Gaze orientation (calibrated for natural reading)
      - Dark/tinted sunglasses check
      - Unauthorized mobile phone & foreign device detection
      - Biometric Face ID anti-impersonation verification
    """
    enrolled_sig = None
    exam_session = None
    if payload.session_id:
        exam_session = db.query(ExamSession).filter(ExamSession.id == payload.session_id).first()
        if exam_session and exam_session.face_signature:
            enrolled_sig = exam_session.face_signature

    analysis = analyze_camera_frame(payload.image_base64, enrolled_signature=enrolled_sig)

    # AUTO-ENROLLMENT GUARD: If session does not yet have Face ID enrolled,
    # automatically lock to the first valid single face that appears in the assessment!
    if exam_session and not exam_session.face_signature and analysis["face_count"] == 1:
        if analysis.get("face_signature"):
            exam_session.face_id = analysis["face_signature"]["face_id"]
            exam_session.face_signature = json.dumps(analysis["face_signature"])
            enroll_event = IntegrityEvent(
                id=str(uuid.uuid4()),
                session_id=exam_session.id,
                event_type="FACE_ID_ENROLLED",
                source="mediapipe_biometrics",
                severity="info",
                confidence=0.99,
                metadata_json=json.dumps({
                    "face_id": exam_session.face_id,
                    "reason": "Automated first-frame biometric Face ID enrollment"
                })
            )
            db.add(enroll_event)
            db.commit()

    # Auto-log anomalous signals if linked to active session
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
        elif analysis["status"] == "face_mismatch" or not analysis.get("face_id_match", True):
            event = IntegrityEvent(
                id=str(uuid.uuid4()),
                session_id=payload.session_id,
                event_type="FACE_MISMATCH_IMPERSONATION",
                occurred_at=datetime.now(timezone.utc),
                source="mediapipe_biometrics",
                severity="critical",
                confidence=0.94,
                metadata_json=json.dumps({
                    "reason": "Active candidate face does not match enrolled Face ID",
                    "similarity": analysis.get("face_id_similarity", 0.0)
                })
            )
            db.add(event)
            db.commit()
        elif analysis.get("phone_detected", False):
            event = IntegrityEvent(
                id=str(uuid.uuid4()),
                session_id=payload.session_id,
                event_type="PHONE_OR_DEVICE_DETECTED",
                occurred_at=datetime.now(timezone.utc),
                source="device_vision_scanner",
                severity="critical",
                confidence=0.90,
                metadata_json=json.dumps({
                    "reason": "Unauthorized mobile phone or foreign object detected in camera view"
                })
            )
            db.add(event)
            db.commit()
        elif analysis.get("eyewear_detected", False):
            event = IntegrityEvent(
                id=str(uuid.uuid4()),
                session_id=payload.session_id,
                event_type="RESTRICTED_EYEWEAR_DETECTED",
                occurred_at=datetime.now(timezone.utc),
                source="opencv_vision_analyzer",
                severity="high",
                confidence=0.90,
                metadata_json=json.dumps({
                    "reason": "Tinted or dark eyewear detected obscuring candidate eye gaze"
                })
            )
            db.add(event)
            db.commit()

    return AnalyzeFrameResponse(
        face_detected=analysis["face_detected"],
        face_count=analysis["face_count"],
        confidence=analysis["confidence"],
        status=analysis["status"],
        bounding_boxes=analysis["bounding_boxes"],
        gaze_direction=analysis.get("gaze_direction", "CENTER"),
        looking_at_screen=analysis.get("looking_at_screen", True),
        eyes=analysis.get("eyes", []),
        eyewear_detected=analysis.get("eyewear_detected", False),
        phone_detected=analysis.get("phone_detected", False),
        phone_boxes=analysis.get("phone_boxes", []),
        face_id_match=analysis.get("face_id_match", True),
        face_id_similarity=analysis.get("face_id_similarity", 1.0),
        frame_width=analysis.get("frame_width", 640),
        frame_height=analysis.get("frame_height", 480)
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
