from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: str


class PublicChoice(BaseModel):
    id: str
    choice_letter: str
    text: str

    model_config = ConfigDict(from_attributes=True)


class PublicQuestion(BaseModel):
    id: str
    question_number: int
    text: str
    choices: List[PublicChoice]

    model_config = ConfigDict(from_attributes=True)


class PublicExam(BaseModel):
    id: str
    title: str
    description: str
    duration_minutes: int
    total_questions: int
    questions: List[PublicQuestion]

    model_config = ConfigDict(from_attributes=True)


# --- Session and Proctoring Schemas ---

class CreateSessionRequest(BaseModel):
    exam_id: str
    candidate_name: str
    candidate_id: str
    face_id: Optional[str] = None
    face_signature: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    exam_id: str
    candidate_name: str
    candidate_id: str
    status: str
    face_id: Optional[str] = None
    is_locked: int = 0
    started_at: datetime
    duration_minutes: int

    model_config = ConfigDict(from_attributes=True)


class SaveAnswerRequest(BaseModel):
    selected_choice_id: str


class AnswerResponse(BaseModel):
    status: str
    question_id: str
    selected_choice_id: str


class LogEventRequest(BaseModel):
    event_type: str
    source: str
    severity: str
    confidence: float = 1.0
    metadata: Dict[str, Any] = {}


class EventResponse(BaseModel):
    id: str
    session_id: str
    event_type: str
    occurred_at: datetime
    source: str
    severity: str
    confidence: float
    metadata: Dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class AnalyzeFrameRequest(BaseModel):
    image_base64: str
    session_id: Optional[str] = None


class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class EyeCoord(BaseModel):
    x: int
    y: int
    name: str


class AnalyzeFrameResponse(BaseModel):
    face_detected: bool
    face_count: int
    confidence: float
    status: str  # "verified", "no_face", "multiple_faces", "face_mismatch"
    bounding_boxes: List[BoundingBox]
    gaze_direction: str  # "CENTER", "LOOKING_LEFT", "LOOKING_RIGHT", "LOOKING_DOWN", "LOOKING_UP"
    looking_at_screen: bool
    eyes: List[EyeCoord] = []
    eyewear_detected: bool = False
    phone_detected: bool = False
    phone_boxes: List[BoundingBox] = []
    face_id_match: bool = True
    face_id_similarity: float = 1.0
    frame_width: Optional[int] = 640
    frame_height: Optional[int] = 480


# --- Pre-Exam Biometric Scan Schemas ---

class PreExamScanRequest(BaseModel):
    image_base64: str
    candidate_id: Optional[str] = None


class PreExamScanResponse(BaseModel):
    face_detected: bool
    face_count: int
    face_id: str
    eyewear_detected: bool
    phone_detected: bool
    all_passed: bool
    details: str
    face_signature_json: Optional[str] = None


class EnrollFaceRequest(BaseModel):
    image_base64: str


class EnrollFaceResponse(BaseModel):
    face_id: str
    status: str
    confidence: float
    message: str


class TeacherUnlockRequest(BaseModel):
    teacher_code: str


class TeacherUnlockResponse(BaseModel):
    unlocked: bool
    session_id: str
    message: str


class SubmitSessionResponse(BaseModel):
    session_id: str
    status: str
    score: int
    total_questions: int
    percentage: float
    submitted_at: datetime
    events_summary: Dict[str, int]
    events: List[EventResponse]
