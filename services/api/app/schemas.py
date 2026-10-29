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


class SessionResponse(BaseModel):
    id: str
    exam_id: str
    candidate_name: str
    candidate_id: str
    status: str
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


class AnalyzeFrameResponse(BaseModel):
    face_detected: bool
    face_count: int
    confidence: float
    status: str  # "verified", "no_face", "multiple_faces"
    bounding_boxes: List[BoundingBox]


class SubmitSessionResponse(BaseModel):
    session_id: str
    status: str
    score: int
    total_questions: int
    percentage: float
    submitted_at: datetime
    events_summary: Dict[str, int]
    events: List[EventResponse]
