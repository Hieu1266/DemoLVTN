from typing import Optional
from uuid import UUID
import uuid
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field

from app.models.status_catalog import ExamStatus


class Exam(SQLModel, table=True):
    __tablename__ = "exam"

    exam_id: UUID = Field(primary_key=True, index=True, default_factory=uuid.uuid4)
    owner_id: UUID = Field(nullable=False, index=True)
    exam_name: str = Field(nullable=False, max_length=255)
    access_code: str = Field(unique=True, nullable=False, max_length=20, index=True)
    duration_minutes: int = Field(nullable=False)
    allow_review_answers: bool = Field(nullable=False, default=False)
    
    # ➕ THÊM TRƯỜNG NÀY: NULL hoặc -1 là không giới hạn, >0 là số lần tối đa
    max_attempts: Optional[int] = Field(default=None, nullable=True) 

    start_at: Optional[datetime] = Field(default=None, nullable=True)
    end_at: Optional[datetime] = Field(default=None, nullable=True)
    created_at: datetime = Field(nullable=False, default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(nullable=False, default_factory=lambda: datetime.now(timezone.utc))
    status_id: str = Field(
        foreign_key="status_catalog.status_id",
        nullable=False,
        default=ExamStatus.DRAFT.value,
    )