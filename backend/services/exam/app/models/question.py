from enum import Enum
from typing import Optional
from uuid import UUID
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Column, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import SQLModel, Field


class QuestionType(str, Enum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_SELECT = "multiple_select"
    TRUE_FALSE = "true_false"
    ESSAY = "essay"
    FILL_BLANK = "fill_blank"


class Question(SQLModel, table=True):
    __tablename__ = "question"

    question_id: UUID = Field(primary_key=True, index=True, default_factory=uuid.uuid4)
    owner_id: UUID = Field(nullable=False, index=True)  # user_id bên Auth_Service, không có FK
    # NULL = câu hỏi nằm trong ngân hàng; có giá trị = bản sao thuộc đề đó (xóa đề thì xóa theo)
    exam_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(ForeignKey("exam.exam_id", ondelete="CASCADE"), nullable=True, index=True),
    )
    question_type: str = Field(nullable=False, max_length=30, default=QuestionType.SINGLE_CHOICE.value)
    content: str = Field(sa_column=Column(Text, nullable=False))
    # Lựa chọn, đáp án đúng, giải thích... lưu dạng JSON theo từng loại câu
    data: Optional[dict] = Field(default=None, sa_column=Column(JSONB, nullable=True))
    points: Decimal = Field(default=Decimal("1"), nullable=False, max_digits=6, decimal_places=2)
    created_at: datetime = Field(nullable=False, default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(nullable=False, default_factory=lambda: datetime.now(timezone.utc))