import logging
import uuid
import httpx
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.config import settings
from app.models import Exam, Question, Choice

logger = logging.getLogger(__name__)


def sync_airtable_exam(db: Session, exam_id: str) -> Dict[str, Any]:
    """
    Synchronize assessment questions with Airtable backend.
    Enforces graceful offline fallback to local database cache if Airtable credentials
    are not configured, network is unavailable, or Airtable service errors out.
    """
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        return {
            "status": "error",
            "source": "none",
            "exam_id": exam_id,
            "questions_synced": 0,
            "message": f"Assessment {exam_id} not found."
        }

    # Check Airtable configuration
    api_key = settings.AIRTABLE_API_KEY.strip()
    base_id = settings.AIRTABLE_BASE_ID.strip()
    table_name = settings.AIRTABLE_TABLE_NAME.strip() or "Questions"

    if not api_key or not base_id:
        local_count = db.query(Question).filter(Question.exam_id == exam_id).count()
        return {
            "status": "synced_local_cache",
            "source": "local_cache_fallback",
            "exam_id": exam_id,
            "questions_synced": local_count,
            "message": "Using local database questions (Airtable API key or Base ID not configured)."
        }

    airtable_url = f"https://api.airtable.com/v0/{base_id}/{table_name}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(airtable_url, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Airtable API returned status {resp.status_code}: {resp.text}")
                local_count = db.query(Question).filter(Question.exam_id == exam_id).count()
                return {
                    "status": "synced_local_cache",
                    "source": "local_cache_fallback",
                    "exam_id": exam_id,
                    "questions_synced": local_count,
                    "message": f"Airtable HTTP {resp.status_code}. Fallback to local cache."
                }

            data = resp.json()
            records = data.get("records", [])
            if not records:
                local_count = db.query(Question).filter(Question.exam_id == exam_id).count()
                return {
                    "status": "synced_local_cache",
                    "source": "local_cache_fallback",
                    "exam_id": exam_id,
                    "questions_synced": local_count,
                    "message": "Airtable returned zero records. Fallback to local cache."
                }

            # Parse and update questions
            synced_count = 0
            for index, rec in enumerate(records, start=1):
                fields = rec.get("fields", {})
                q_text = fields.get("Question") or fields.get("text") or fields.get("Question Text")
                if not q_text:
                    continue

                q_id = f"{exam_id}-q{index}"
                question = db.query(Question).filter(Question.id == q_id).first()
                if not question:
                    question = Question(
                        id=q_id,
                        exam_id=exam_id,
                        question_number=index,
                        text=q_text
                    )
                    db.add(question)
                else:
                    question.text = q_text
                    question.question_number = index

                # Process choices (A, B, C, D)
                correct_letter = str(fields.get("Correct Choice") or fields.get("Answer") or "A").strip().upper()
                for letter in ["A", "B", "C", "D"]:
                    c_text = fields.get(f"Choice {letter}") or fields.get(f"Option {letter}") or f"Option {letter}"
                    c_id = f"{q_id}-{letter.lower()}"
                    choice = db.query(Choice).filter(Choice.id == c_id).first()
                    if not choice:
                        choice = Choice(
                            id=c_id,
                            question_id=q_id,
                            choice_letter=letter,
                            text=str(c_text)
                        )
                        db.add(choice)
                    else:
                        choice.text = str(c_text)

                    if letter == correct_letter:
                        question.correct_choice_id = c_id

                synced_count += 1

            exam.total_questions = synced_count
            db.commit()

            return {
                "status": "synced_airtable",
                "source": "airtable_api",
                "exam_id": exam_id,
                "questions_synced": synced_count,
                "message": f"Successfully synchronized {synced_count} questions from Airtable."
            }

    except Exception as exc:
        logger.error(f"Error connecting to Airtable: {exc}")
        local_count = db.query(Question).filter(Question.exam_id == exam_id).count()
        return {
            "status": "synced_local_cache",
            "source": "local_cache_fallback",
            "exam_id": exam_id,
            "questions_synced": local_count,
            "message": f"Network error contacting Airtable: {exc}. Fallback to local cache."
        }
