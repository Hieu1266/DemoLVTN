from typing import Optional
from uuid import UUID
import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field


class AttemptAnswer(SQLModel, table=True):
    __tablename__ = "attempt_answer"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question"),
    )

    answer_id: UUID = Field(primary_key=True, index=True, default_factory=uuid.uuid4)
    attempt_id: UUID = Field(foreign_key="attempt.attempt_id", nullable=False, index=True)
    question_id: UUID = Field(foreign_key="question.question_id", nullable=False)
    user_answer: Optional[str] = Field(default=None)
    is_correct: Optional[bool] = Field(default=None)
    points_earned: float = Field(nullable=False, default=0.0)