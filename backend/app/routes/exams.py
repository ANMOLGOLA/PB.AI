from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Exam, Question
from app.schemas import PublicExam, PublicQuestion, PublicChoice, AirtableSyncResponse
from app.airtable import sync_airtable_exam

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


@router.get("/{exam_id}", response_model=PublicExam, status_code=status.HTTP_200_OK)
def get_exam(exam_id: str, db: Session = Depends(get_db)) -> PublicExam:
    """
    Retrieve a specific examination by ID with public question items.
    Correct answer keys are strictly omitted.
    """
    exam = (
        db.query(Exam)
        .options(
            joinedload(Exam.questions).joinedload(Question.choices)
        )
        .filter(Exam.id == exam_id)
        .first()
    )

    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {exam_id} not found."
        )

    sanitized_questions: List[PublicQuestion] = []
    for q in sorted(exam.questions, key=lambda x: x.question_number):
        sanitized_choices = [
            PublicChoice(
                id=c.id,
                choice_letter=c.choice_letter,
                text=c.text
            )
            for c in sorted(q.choices, key=lambda x: x.choice_letter)
        ]
        sanitized_questions.append(
            PublicQuestion(
                id=q.id,
                question_number=q.question_number,
                text=q.text,
                choices=sanitized_choices
            )
        )

    return PublicExam(
        id=exam.id,
        title=exam.title,
        description=exam.description,
        duration_minutes=exam.duration_minutes,
        total_questions=exam.total_questions,
        questions=sanitized_questions
    )


@router.post("/{exam_id}/sync-airtable", response_model=AirtableSyncResponse, status_code=status.HTTP_200_OK)
def sync_airtable(exam_id: str, db: Session = Depends(get_db)) -> AirtableSyncResponse:
    """
    Synchronize questions for an assessment with Airtable or fallback gracefully to local cache.
    """
    result = sync_airtable_exam(db, exam_id)
    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("message", "Sync failed.")
        )
    return AirtableSyncResponse(**result)
