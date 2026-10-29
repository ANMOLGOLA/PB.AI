from typing import Any, List
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models import Question


# Substrings that must never appear in any response key
FORBIDDEN_KEY_SUBSTRINGS = [
    "correct",
    "solution",
    "grading",
    "answer_key",
    "correct_choice",
    "is_correct"
]


def recursive_inspect_keys(node: Any, path: str = "root") -> List[str]:
    """Recursively search any JSON node for forbidden security keys."""
    violations = []
    if isinstance(node, dict):
        for k, v in node.items():
            current_path = f"{path}.{k}"
            k_lower = k.lower()
            for forbidden in FORBIDDEN_KEY_SUBSTRINGS:
                if forbidden in k_lower:
                    violations.append(f"Forbidden security key detected at {current_path}: '{k}'")
            violations.extend(recursive_inspect_keys(v, current_path))
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            violations.extend(recursive_inspect_keys(item, f"{path}[{idx}]"))
    return violations


def test_zero_answer_leakage_in_public_exams(client: TestClient, db_session: Session):
    """
    Recursively inspect GET /api/exams response to guarantee zero leakage of
    internal correct_choice_ids, answer keys, or grading attributes.
    """
    # Fetch questions directly from DB to verify private field values
    db_questions = db_session.query(Question).all()
    assert len(db_questions) == 5
    db_correct_map = {q.id: q.correct_choice_id for q in db_questions}

    # Fetch public endpoint response
    response = client.get("/api/exams")
    assert response.status_code == 200
    json_data = response.json()

    # 1. Recursive check for forbidden key names across the entire JSON tree
    key_violations = recursive_inspect_keys(json_data)
    assert not key_violations, f"Forbidden keys present in public response: {key_violations}"

    # 2. Verify that for every question, no question field discloses which choice is correct
    for exam in json_data:
        assert "questions" in exam
        for q in exam["questions"]:
            q_id = q["id"]
            # The private correct_choice_id for this question
            private_correct_id = db_correct_map[q_id]

            # The question must ONLY have public fields: id, question_number, text, choices
            allowed_q_keys = {"id", "question_number", "text", "choices"}
            assert set(q.keys()) == allowed_q_keys, f"Unexpected question keys: {set(q.keys()) - allowed_q_keys}"

            # Ensure private_correct_id is never attached to the question object
            assert "correct_choice_id" not in q

            # Choices must only have id, choice_letter, text
            allowed_choice_keys = {"id", "choice_letter", "text"}
            for c in q["choices"]:
                assert set(c.keys()) == allowed_choice_keys
                assert "is_correct" not in c
                assert "correct" not in c
