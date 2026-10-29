from typing import List
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
