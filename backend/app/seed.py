import sys
from pathlib import Path

# Add project root to path for direct script execution
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session
from app.database import SessionLocal, init_db
from app.models import Exam, Question, Choice

DEMO_EXAM_ID = "e0000000-0000-4000-8000-000000000001"

SEED_DATA = {
    "id": DEMO_EXAM_ID,
    "title": "Systems Engineering & Secure Computing Assessment",
    "description": "Foundational evaluation of desktop process isolation, network security boundaries, and defensive software architecture.",
    "duration_minutes": 30,
    "total_questions": 5,
    "questions": [
        {
            "id": "q0000000-0000-4000-8000-000000000001",
            "question_number": 1,
            "text": "In an Electron desktop application architecture, which configuration is mandatory to guarantee that Node.js runtime APIs are completely isolated from the web renderer?",
            "correct_choice_id": "c0000000-0000-4000-8000-000000000001",
            "choices": [
                {
                    "id": "c0000000-0000-4000-8000-000000000001",
                    "choice_letter": "A",
                    "text": "Set contextIsolation: true and nodeIntegration: false in WebPreferences"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000002",
                    "choice_letter": "B",
                    "text": "Disable webSecurity and enable allowRunningInsecureContent"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000003",
                    "choice_letter": "C",
                    "text": "Enable the remote module and execute scripts in a Web Worker"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000004",
                    "choice_letter": "D",
                    "text": "Set sandbox: false and configure nodeIntegrationInSubFrames: true"
                }
            ]
        },
        {
            "id": "q0000000-0000-4000-8000-000000000002",
            "question_number": 2,
            "text": "Which Content Security Policy (CSP) directive strictly restricts the renderer to loading scripts exclusively from its own packaged bundle while prohibiting inline eval execution?",
            "correct_choice_id": "c0000000-0000-4000-8000-000000000006",
            "choices": [
                {
                    "id": "c0000000-0000-4000-8000-000000000005",
                    "choice_letter": "A",
                    "text": "script-src * 'unsafe-inline'"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000006",
                    "choice_letter": "B",
                    "text": "script-src 'self'"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000007",
                    "choice_letter": "C",
                    "text": "default-src 'none'; script-src https://*"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000008",
                    "choice_letter": "D",
                    "text": "script-src 'unsafe-eval' data:"
                }
            ]
        },
        {
            "id": "q0000000-0000-4000-8000-000000000003",
            "question_number": 3,
            "text": "When designing an automated proctoring telemetry system, how should detector confidence values be interpreted and reported?",
            "correct_choice_id": "c0000000-0000-4000-8000-000000000010",
            "choices": [
                {
                    "id": "c0000000-0000-4000-8000-000000000009",
                    "choice_letter": "A",
                    "text": "As a definitive mathematical probability that the candidate committed academic dishonesty"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000010",
                    "choice_letter": "B",
                    "text": "As the statistical reliability score of the signal detector, intended to guide human review rather than trigger automated disqualification"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000011",
                    "choice_letter": "C",
                    "text": "As an integer count of anomalous pixels identified by the computer vision framework"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000012",
                    "choice_letter": "D",
                    "text": "As an immutable cryptographic hash of the webcam audio spectrum"
                }
            ]
        },
        {
            "id": "q0000000-0000-4000-8000-000000000004",
            "question_number": 4,
            "text": "To achieve ACID compliance and prevent corrupted partial states during session submission in a relational database, which mechanism must be employed?",
            "correct_choice_id": "c0000000-0000-4000-8000-000000000013",
            "choices": [
                {
                    "id": "c0000000-0000-4000-8000-000000000013",
                    "choice_letter": "A",
                    "text": "Atomic database transactions with explicit commit and rollback boundaries"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000014",
                    "choice_letter": "B",
                    "text": "Asynchronous fire-and-forget background threads writing to independent flat files"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000015",
                    "choice_letter": "C",
                    "text": "Client-side localStorage caching without backend confirmation"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000016",
                    "choice_letter": "D",
                    "text": "Periodic uncoordinated bulk overwrites of the entire database file"
                }
            ]
        },
        {
            "id": "q0000000-0000-4000-8000-000000000005",
            "question_number": 5,
            "text": "Why must assessment question answer keys and grading solutions be stored exclusively on the backend and omitted from public exam schemas?",
            "correct_choice_id": "c0000000-0000-4000-8000-000000000018",
            "choices": [
                {
                    "id": "c0000000-0000-4000-8000-000000000017",
                    "choice_letter": "A",
                    "text": "Because SQLite databases cannot store strings longer than 32 bytes"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000018",
                    "choice_letter": "B",
                    "text": "To prevent client-side inspection or network tampering from disclosing correct answers to candidates before evaluation"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000019",
                    "choice_letter": "C",
                    "text": "Because React component props do not support boolean grading flags"
                },
                {
                    "id": "c0000000-0000-4000-8000-000000000020",
                    "choice_letter": "D",
                    "text": "To reduce HTTP payload size below the standard TCP maximum transmission unit (MTU)"
                }
            ]
        }
    ]
}


def seed_database(db: Session) -> dict:
    """
    Idempotently initialize and seed the demo assessment.
    Guarantees exactly one exam with five questions and twenty choices.
    """
    try:
        # Check if demo exam already exists
        exam = db.query(Exam).filter(Exam.id == DEMO_EXAM_ID).first()
        if not exam:
            exam = Exam(
                id=SEED_DATA["id"],
                title=SEED_DATA["title"],
                description=SEED_DATA["description"],
                duration_minutes=SEED_DATA["duration_minutes"],
                total_questions=SEED_DATA["total_questions"]
            )
            db.add(exam)
            db.flush()
        else:
            exam.title = SEED_DATA["title"]
            exam.description = SEED_DATA["description"]
            exam.duration_minutes = SEED_DATA["duration_minutes"]
            exam.total_questions = SEED_DATA["total_questions"]
            db.flush()

        questions_seeded = 0
        choices_seeded = 0

        for q_data in SEED_DATA["questions"]:
            question = db.query(Question).filter(Question.id == q_data["id"]).first()
            if not question:
                question = Question(
                    id=q_data["id"],
                    exam_id=exam.id,
                    question_number=q_data["question_number"],
                    text=q_data["text"],
                    correct_choice_id=q_data["correct_choice_id"]
                )
                db.add(question)
                db.flush()
            else:
                question.question_number = q_data["question_number"]
                question.text = q_data["text"]
                question.correct_choice_id = q_data["correct_choice_id"]
                db.flush()

            questions_seeded += 1

            for c_data in q_data["choices"]:
                choice = db.query(Choice).filter(Choice.id == c_data["id"]).first()
                if not choice:
                    choice = Choice(
                        id=c_data["id"],
                        question_id=question.id,
                        choice_letter=c_data["choice_letter"],
                        text=c_data["text"]
                    )
                    db.add(choice)
                else:
                    choice.choice_letter = c_data["choice_letter"]
                    choice.text = c_data["text"]
                choices_seeded += 1

        db.commit()
        return {
            "status": "success",
            "exam_id": exam.id,
            "questions_count": questions_seeded,
            "choices_count": choices_seeded
        }
    except Exception as e:
        db.rollback()
        raise RuntimeError(f"Database seeding failed: {e}") from e


def run_seed() -> None:
    """CLI Entrypoint for database initialization and seeding."""
    print("Initializing SQLite tables...")
    init_db()
    db = SessionLocal()
    try:
        result = seed_database(db)
        print(f"Seeding completed successfully: {result}")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
