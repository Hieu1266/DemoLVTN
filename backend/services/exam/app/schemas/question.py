from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


class QuestionType(str, Enum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_SELECT = "multiple_select"
    TRUE_FALSE = "true_false"
    ESSAY = "essay"
    FILL_BLANK = "fill_blank"


class QuestionBase(BaseModel):
    question_type: QuestionType = QuestionType.SINGLE_CHOICE
    content: str
    data: Optional[Dict[str, Any]] = Field(
        default=None, 
        description="Chứa options, statements, blanks, sample_answer, explanation..."
    )
    points: Decimal = Field(default=Decimal("1.00"), max_digits=6, decimal_places=2)


class QuestionCreate(QuestionBase):
    exam_id: Optional[UUID] = None  # None = Lưu vào Ngân hàng câu hỏi


class QuestionUpdate(BaseModel):
    question_type: Optional[QuestionType] = None
    content: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    points: Optional[Decimal] = None


class QuestionResponse(QuestionBase):
    question_id: UUID
    owner_id: UUID
    exam_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True