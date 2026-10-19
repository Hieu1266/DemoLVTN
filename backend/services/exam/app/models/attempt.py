from typing import Optional
from uuid import UUID
import uuid
from datetime import datetime

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import SQLModel, Field


class Attempt(SQLModel, table=True):
    __tablename__ = "attempt"

    attempt_id: UUID = Field(primary_key=True, index=True, default_factory=uuid.uuid4)
    exam_id: UUID = Field(foreign_key="exam.exam_id", nullable=False, index=True)
    user_id: UUID = Field(nullable=False, index=True)  # user_id bên Auth_Service, không có FK
    status: str = Field(nullable=False, default="in_progress", max_length=20)
    started_at: datetime = Field(nullable=False, default_factory=datetime.utcnow)
    deadline_at: Optional[datetime] = Field(default=None, nullable=True)
    submitted_at: Optional[datetime] = Field(default=None, nullable=True)
    draft_answers: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    total_score: Optional[float] = Field(default=None, nullable=True)