from fastapi.testclient import TestClient


def test_list_exams_structure(client: TestClient):
    """Verify GET /api/exams returns exactly one exam with five well-formed MCQs."""
    response = client.get("/api/exams")
    assert response.status_code == 200
    exams = response.json()
    assert isinstance(exams, list)
    assert len(exams) == 1

    demo_exam = exams[0]
    assert demo_exam["id"] == "e0000000-0000-4000-8000-000000000001"
    assert demo_exam["title"] == "Systems Engineering & Secure Computing Assessment"
    assert demo_exam["duration_minutes"] == 30
    assert demo_exam["total_questions"] == 5

    questions = demo_exam["questions"]
    assert len(questions) == 5

    # Verify each question structure and sequential ordering
    for idx, q in enumerate(questions, start=1):
        assert q["question_number"] == idx
        assert isinstance(q["text"], str) and len(q["text"]) > 10
        choices = q["choices"]
        assert len(choices) == 4
        choice_letters = [c["choice_letter"] for c in choices]
        assert choice_letters == ["A", "B", "C", "D"]
        for c in choices:
            assert isinstance(c["id"], str)
            assert isinstance(c["text"], str) and len(c["text"]) > 0
