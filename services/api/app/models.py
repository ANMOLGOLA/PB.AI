from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
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
