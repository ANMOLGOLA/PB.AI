from sqlalchemy.orm import Session
from app.models import Exam, Question, Choice
from app.seed import seed_database, DEMO_EXAM_ID


def test_database_seeding_counts(db_session: Session):
    """Verify demo seeding creates exactly 1 exam, 5 questions, and 20 choices."""
    exam_count = db_session.query(Exam).count()
    assert exam_count == 1

    question_count = db_session.query(Question).count()
    assert question_count == 5

    choice_count = db_session.query(Choice).count()
    assert choice_count == 20


def test_idempotent_repeated_seeding(db_session: Session):
    """Verify executing seed_database multiple times does not produce duplicate entities."""
    # Seed repeatedly
    seed_database(db_session)
    seed_database(db_session)

    exam_count = db_session.query(Exam).count()
    assert exam_count == 1

    question_count = db_session.query(Question).count()
    assert question_count == 5

    choice_count = db_session.query(Choice).count()
    assert choice_count == 20


def test_internal_correct_answer_persistence(db_session: Session):
    """Verify that correct answers exist in private database records."""
    questions = db_session.query(Question).filter(Question.exam_id == DEMO_EXAM_ID).all()
    assert len(questions) == 5

    for q in questions:
        assert q.correct_choice_id is not None
        assert len(q.correct_choice_id) > 0
        # Ensure the correct choice ID actually corresponds to one of the question's choices
        choice_ids = [c.id for c in q.choices]
        assert q.correct_choice_id in choice_ids
