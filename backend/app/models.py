from datetime import datetime, timezone
import json
from typing import Any, Dict
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Exam(Base):
    __tablename__ = "exams"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=30)
    total_questions = Column(Integer, nullable=False, default=5)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    questions = relationship(
        "Question",
        back_populates="exam",
        cascade="all, delete-orphan",
        order_by="Question.question_number"
    )
    sessions = relationship("ExamSession", back_populates="exam", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(String(36), primary_key=True, index=True)
    exam_id = Column(String(36), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    question_number = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    # PRIVATE SECURITY FIELD: Never exposed in public schemas or endpoints
    correct_choice_id = Column(String(36), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    exam = relationship("Exam", back_populates="questions")
    choices = relationship(
        "Choice",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="Choice.choice_letter"
    )


class Choice(Base):
    __tablename__ = "choices"

    id = Column(String(36), primary_key=True, index=True)
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    choice_letter = Column(String(5), nullable=False)  # "A", "B", "C", "D"
    text = Column(Text, nullable=False)

    question = relationship("Question", back_populates="choices")


class ExamSession(Base):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, index=True)
    exam_id = Column(String(36), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    candidate_name = Column(String(255), nullable=False)
    candidate_id = Column(String(100), nullable=False)
    status = Column(String(30), default="active", nullable=False)  # "active", "submitted", "locked"
    score = Column(Integer, nullable=True)  # Populated only on submit
    face_id = Column(String(50), nullable=True)  # Unique biometric enrollment Face ID
    face_signature = Column(Text, nullable=True)  # Biometric landmark signature
    is_locked = Column(Integer, default=0, nullable=False)  # 1 when candidate reaches violation threshold
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    submitted_at = Column(DateTime, nullable=True)

    exam = relationship("Exam", back_populates="sessions")
    answers = relationship("CandidateAnswer", back_populates="session", cascade="all, delete-orphan")
    events = relationship("IntegrityEvent", back_populates="session", cascade="all, delete-orphan", order_by="IntegrityEvent.occurred_at")


class CandidateAnswer(Base):
    __tablename__ = "candidate_answers"

    id = Column(String(36), primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    selected_choice_id = Column(String(36), nullable=False)
    saved_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    session = relationship("ExamSession", back_populates="answers")


class IntegrityEvent(Base):
    __tablename__ = "integrity_events"

    id = Column(String(36), primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(50), nullable=False)
    occurred_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    source = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    confidence = Column(Float, nullable=False, default=1.0)
    metadata_json = Column(Text, default="{}")

    # Proctor Review Audit Fields
    review_status = Column(String(30), default="unreviewed", nullable=False)
    review_notes = Column(Text, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    session = relationship("ExamSession", back_populates="events")

    @property
    def metadata_dict(self) -> Dict[str, Any]:
        try:
            return json.loads(self.metadata_json or "{}")
        except Exception:
            return {}


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(String(36), primary_key=True, index=True)
    identifier = Column(String(255), nullable=False, index=True)  # Email or Phone
    otp_code = Column(String(12), nullable=False)
    attempts_left = Column(Integer, nullable=False, default=3)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    is_verified = Column(Integer, default=0, nullable=False)
