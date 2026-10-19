from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.question import QuestionCreate, QuestionResponse


# Base Schema cho Exam
class ExamBase(BaseModel):
    exam_name: str = Field(..., max_length=255, description="Tên đề thi")
    access_code: str = Field(..., max_length=20, description="Mã phòng thi")
    duration_minutes: int = Field(default=60, ge=1, description="Thời gian làm bài (phút)")
    allow_review_answers: bool = Field(default=False, description="Cho xem lại đáp án")
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    status_id: str = Field(default="DRAFT", description="Trạng thái: DRAFT hoặc PUBLISHED")


# Schema Input khi Tạo đề thi
class ExamCreate(ExamBase):
    # Danh sách ID các câu hỏi chọn từ Ngân hàng để clone vào đề
    question_ids: Optional[List[UUID]] = Field(default=[], description="ID câu hỏi từ Ngân hàng")
    
    # Danh sách câu hỏi tạo trực tiếp trong form tạo đề
    inline_questions: Optional[List[QuestionCreate]] = Field(default=[], description="Câu hỏi tạo trực tiếp")


# Schema Input khi Cập nhật đề thi
class ExamUpdate(BaseModel):
    exam_name: Optional[str] = None
    access_code: Optional[str] = None
    duration_minutes: Optional[int] = None
    allow_review_answers: Optional[bool] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    status_id: Optional[str] = None


# Schema Response Đề thi
class ExamResponse(ExamBase):
    exam_id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Schema Response Đề thi kèm Chi tiết danh sách câu hỏi
class ExamDetailResponse(ExamResponse):
    questions: List[QuestionResponse] = []