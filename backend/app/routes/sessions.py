import os
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
    SubmitSessionResponse,
    IncidentReviewRequest,
    IncidentReviewResponse,
    StartSessionResponse,
    SessionReadinessResponse
)
from app.proctoring import analyze_camera_frame
from app.vision.temporal_tracker import global_temporal_tracker
from app.vision.vlm_service import global_vlm_service
from app.routes.webrtc import signaling_manager

router = APIRouter(prefix="/api", tags=["Sessions & Proctoring"])


@router.get("/proctor/engine")
def get_proctor_engine_status():
    """Check status of Local Computer Vision and Secondary VLM Providers."""
    vlm_status = global_vlm_service.get_status()
    has_groq = vlm_status["providers"]["groq_vision"]["configured"]
    has_gemini = vlm_status["providers"]["gemini_vision"]["configured"]

    return {
        "engine": "local_mediapipe_realtime",
        "primary_detector": "MediaPipe BlazeFace (Local Real-Time ~10ms)",
        "temporal_analysis": "Active (Sliding Window & Cooldown Smoothing)",
        "model": settings.GROQ_VISION_MODEL,
        "gemini_model": settings.GEMINI_VISION_MODEL,
        "groq_configured": has_groq,
        "gemini_configured": has_gemini,
        "secondary_vlm_provider": vlm_status["active_secondary_provider"],
        "pipeline_layers": {
            "layer_a_local_vision": "MediaPipe BlazeFace (~10ms)",
            "layer_b_temporal_tracker": "Active (4.0s sustained absence, 2.0s multiple faces)",
            "layer_c_secondary_vlm": "On-Demand (Gemini 3.1 Flash Lite / Groq)"
        }
    }


@router.post("/proctor/engine/configure")
def configure_groq_engine(payload: dict):
    """Dynamically set or update Groq and Gemini API keys for AI vision proctoring."""
    key = payload.get("api_key", "").strip() or payload.get("groq_api_key", "").strip()
    if key:
        settings.GROQ_API_KEY = key
        os.environ["GROQ_API_KEY"] = key

    gemini_key = payload.get("gemini_api_key", "").strip()
    if gemini_key:
        settings.GEMINI_API_KEY = gemini_key
        os.environ["GEMINI_API_KEY"] = gemini_key

    model = payload.get("model", "").strip()
    if model:
        settings.GROQ_VISION_MODEL = model

    has_groq = bool(settings.GROQ_API_KEY)
    has_gemini = bool(settings.GEMINI_API_KEY)

    return {
        "configured": has_groq or has_gemini,
        "engine": "groq_vision" if has_groq else ("gemini_vision" if has_gemini else "fallback_local"),
        "model": settings.GROQ_VISION_MODEL,
        "gemini_model": settings.GEMINI_VISION_MODEL,
        "groq_configured": has_groq,
        "gemini_configured": has_gemini,
        "message": "AI Vision configuration updated."
    }


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(payload: CreateSessionRequest, db: Session = Depends(get_db)):
    """Initialize a monitored examination session for a candidate, or resume an existing active session."""
    exam = db.query(Exam).filter(Exam.id == payload.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Guard: Check for existing session for this candidate and assessment
    existing_session = (
        db.query(ExamSession)
        .filter(
            ExamSession.exam_id == payload.exam_id,
            ExamSession.candidate_id == payload.candidate_id
        )
        .order_by(ExamSession.started_at.desc())
        .first()
    )
    if existing_session:
        if existing_session.status == "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This assessment has already been submitted and finalized."
            )
        # Reuse existing active or locked session to prevent duplicate active sessions on reload
        return SessionResponse(
            id=existing_session.id,
            exam_id=existing_session.exam_id,
            candidate_name=existing_session.candidate_name,
            candidate_id=existing_session.candidate_id,
            status=existing_session.status,
            face_id=existing_session.face_id,
            is_locked=existing_session.is_locked,
            started_at=existing_session.started_at,
            duration_minutes=exam.duration_minutes
        )

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


@router.get("/sessions/{session_id}/readiness", response_model=SessionReadinessResponse)
def check_session_readiness(session_id: str, db: Session = Depends(get_db)):
    """
    Validates pre-exam readiness conditions:
    1. Active session exists and is unlocked.
    2. Candidate biometric Face ID is enrolled.
    3. Mandatory WebRTC screen sharing is actively streaming to the backend room.
    """
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    room = signaling_manager.rooms.get(session_id)
    is_sharing = bool(room and room.is_sharing)
    has_face = bool(exam_session.face_id)

    return SessionReadinessResponse(
        session_id=session_id,
        screen_sharing_active=is_sharing,
        face_enrolled=has_face,
        is_ready=is_sharing and has_face and not exam_session.is_locked,
        candidate_name=exam_session.candidate_name
    )


@router.post("/sessions/{session_id}/start", response_model=StartSessionResponse)
def start_session_assessment(session_id: str, db: Session = Depends(get_db)):
    """
    Official start gate for examination assessment.
    Hard requirement: Mandatory screen sharing must be active before questions can be accessed or exam timer begins.
    """
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    if exam_session.is_locked:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Session is locked. Contact proctor."
        )

    if exam_session.status == "submitted":
        raise HTTPException(
            status_code=400,
            detail="Session has already been submitted."
        )

    # Mandatory Screen Sharing Verification
    room = signaling_manager.rooms.get(session_id)
    is_sharing = bool(room and room.is_sharing)
    if not is_sharing:
        raise HTTPException(
            status_code=400,
            detail="Screen sharing is required before starting the assessment. Please share your screen and try again."
        )

    # Check if EXAM_OFFICIALLY_STARTED event already logged
    existing_start = (
        db.query(IntegrityEvent)
        .filter(IntegrityEvent.session_id == session_id, IntegrityEvent.event_type == "EXAM_OFFICIALLY_STARTED")
        .first()
    )
    if not existing_start:
        start_event = IntegrityEvent(
            id=str(uuid.uuid4()),
            session_id=session_id,
            event_type="EXAM_OFFICIALLY_STARTED",
            occurred_at=datetime.now(timezone.utc),
            source="system_readiness_gate",
            severity="info",
            confidence=1.0,
            metadata_json=json.dumps({
                "screen_sharing_verified": True,
                "candidate_name": exam_session.candidate_name,
                "face_id": exam_session.face_id
            })
        )
        db.add(start_event)
        db.commit()

    return StartSessionResponse(
        status="started",
        session_id=session_id,
        screen_sharing_active=True,
        started_at=datetime.now(timezone.utc),
        message="Assessment officially started with mandatory screen sharing verified."
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


@router.get("/sessions/{session_id}/answers")
def get_session_answers(session_id: str, db: Session = Depends(get_db)):
    """
    Retrieve candidate's currently saved answers for an assessment session.
    Allows candidate exam workspace to recover immediately from network interruptions or reloads.
    """
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    answers = db.query(CandidateAnswer).filter(CandidateAnswer.session_id == session_id).all()
    return {
        "session_id": session_id,
        "answers": {a.question_id: a.selected_choice_id for a in answers}
    }


@router.put("/sessions/{session_id}/answers/{question_id}", response_model=AnswerResponse)
def save_answer(
    session_id: str,
    question_id: str,
    payload: SaveAnswerRequest,
    db: Session = Depends(get_db)
):
    """Save or update candidate's selected choice for an MCQ question with ownership validation."""
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session or exam_session.status != "active":
        raise HTTPException(status_code=400, detail="Active exam session not found")

    if exam_session.is_locked:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Exam session locked due to integrity violations. Contact proctor."
        )

    # Validate that question belongs to this exam
    question = db.query(Question).filter(
        Question.id == question_id,
        Question.exam_id == exam_session.exam_id
    ).first()
    if not question:
        raise HTTPException(status_code=400, detail="Invalid question ID for this assessment")

    # Validate that selected choice belongs to this question
    from app.models import Choice
    choice = db.query(Choice).filter(
        Choice.id == payload.selected_choice_id,
        Choice.question_id == question_id
    ).first()
    if not choice:
        raise HTTPException(status_code=400, detail="Invalid choice ID for this question")

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
    """
    Log a security or behavioral integrity telemetry event.
    Provides idempotent deduplication to prevent duplicate logging.
    """
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Idempotent lookup: Check if explicit event_id is supplied
    explicit_id = payload.metadata.get("event_id") if payload.metadata else None
    if explicit_id:
        existing = db.query(IntegrityEvent).filter(IntegrityEvent.id == explicit_id).first()
        if existing:
            return EventResponse(
                id=existing.id,
                session_id=existing.session_id,
                event_type=existing.event_type,
                occurred_at=existing.occurred_at,
                source=existing.source,
                severity=existing.severity,
                confidence=existing.confidence,
                metadata=existing.metadata_dict
            )

    # Cooldown deduplication: suppress duplicate events of same type from same source within 2.5s
    recent_cutoff = datetime.now(timezone.utc).timestamp() - 2.5
    recent_events = (
        db.query(IntegrityEvent)
        .filter(
            IntegrityEvent.session_id == session_id,
            IntegrityEvent.event_type == payload.event_type,
            IntegrityEvent.source == payload.source
        )
        .order_by(IntegrityEvent.occurred_at.desc())
        .first()
    )
    if recent_events and recent_events.occurred_at.timestamp() >= recent_cutoff:
        return EventResponse(
            id=recent_events.id,
            session_id=recent_events.session_id,
            event_type=recent_events.event_type,
            occurred_at=recent_events.occurred_at,
            source=recent_events.source,
            severity=recent_events.severity,
            confidence=recent_events.confidence,
            metadata=recent_events.metadata_dict
        )

    event_id = explicit_id or str(uuid.uuid4())
    event = IntegrityEvent(
        id=event_id,
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

    # Layer B: Temporal smoothing and sustained event evaluation
    if exam_session and exam_session.status == "active":
        sustained_events = global_temporal_tracker.evaluate_frame(exam_session.id, analysis)
        for ev in sustained_events:
            event_type = ev["event_type"]
            db_event = IntegrityEvent(
                id=ev["event_id"],
                session_id=exam_session.id,
                event_type="NO_FACE_DETECTED" if event_type == "FACE_ABSENT_SUSTAINED" else event_type,
                occurred_at=datetime.now(timezone.utc),
                source=ev["source"],
                severity=ev["severity"],
                confidence=ev["confidence"],
                metadata_json=json.dumps({
                    **ev.get("metadata", {}),
                    "original_temporal_type": event_type,
                    "duration_ms": ev.get("duration_ms"),
                    "temporal_smoothed": True
                })
            )
            db.add(db_event)
        if sustained_events:
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
        frame_height=analysis.get("frame_height", 480),
        latency_ms=analysis.get("latency_ms", 10.0),
        engine="local_mediapipe_realtime"
    )


@router.post("/sessions/{session_id}/incident-review", response_model=IncidentReviewResponse)
def review_incident_snapshot(
    session_id: str,
    payload: IncidentReviewRequest,
    db: Session = Depends(get_db)
):
    """
    Layer C: On-demand forensic review of a flagged incident snapshot using optional VLM.
    Strictly isolated from real-time webcam frame loop.
    Observations are explicitly marked as model_suggestion and unverified_by_examiner.
    """
    exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not exam_session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = global_vlm_service.review_incident(
        image_base64=payload.image_base64,
        incident_context=payload.incident_context or f"Forensic review for session {session_id}",
        preferred_provider=payload.preferred_provider
    )

    if result.get("status") == "success":
        review_event = IntegrityEvent(
            id=str(uuid.uuid4()),
            session_id=session_id,
            event_type="VLM_INCIDENT_REVIEW",
            occurred_at=datetime.now(timezone.utc),
            source=f"vlm_{result['provider_name']}",
            severity="info",
            confidence=0.85,
            metadata_json=json.dumps({
                "provider": result["provider_name"],
                "model": result["model_name"],
                "summary": result["semantic_summary"],
                "observations": result["observations"],
                "unverified_by_examiner": True
            })
        )
        db.add(review_event)
        db.commit()

    return IncidentReviewResponse(**result)


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

    # Idempotent return if already submitted: prevents duplicate submission events or state corruption
    if exam_session.status == "submitted":
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
        score = exam_session.score if exam_session.score is not None else 0
        percentage = round((score / total_q) * 100, 1)
        return SubmitSessionResponse(
            session_id=session_id,
            status="submitted",
            score=score,
            total_questions=len(questions),
            percentage=percentage,
            submitted_at=exam_session.submitted_at or datetime.now(timezone.utc),
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
