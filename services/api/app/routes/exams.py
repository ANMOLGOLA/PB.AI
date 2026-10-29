from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Exam, Question, Choice
from app.schemas import PublicExam, PublicQuestion, PublicChoice

router = APIRouter(prefix="/api/exams", tags=["Exams"])


@router.get("", response_model=List[PublicExam], status_code=status.HTTP_200_OK)
def list_exams(db: Session = Depends(get_db)) -> List[PublicExam]:
    """
    Retrieve all public examination records with sanitized question and choice structures.
    Correct answer keys and grading solutions are strictly omitted.
    """
    exams = (
        db.query(Exam)
        .options(
            joinedload(Exam.questions).joinedload(Question.choices)
        )
        .order_by(Exam.created_at)
        .all()
    )

    # Explicit mapping to strictly enforce public response boundary
    sanitized_exams: List[PublicExam] = []
    for exam in exams:
        sanitized_questions: List[PublicQuestion] = []
        for q in exam.questions:
            sanitized_choices = [
                PublicChoice(
                    id=c.id,
                    choice_letter=c.choice_letter,
                    text=c.text
                )
                for c in q.choices
            ]
            sanitized_questions.append(
                PublicQuestion(
                    id=q.id,
                    question_number=q.question_number,
                    text=q.text,
                    choices=sanitized_choices
                )
            )

        sanitized_exams.append(
            PublicExam(
                id=exam.id,
                title=exam.title,
                description=exam.description,
                duration_minutes=exam.duration_minutes,
                total_questions=exam.total_questions,
                questions=sanitized_questions
            )
        )

    return sanitized_exams
