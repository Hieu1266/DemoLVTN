from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# 1. Đăng ký vào phòng thi bằng mã PIN
class JoinExamRequest(BaseModel):
    access_code: str = Field(..., max_length=20)


# 2. Item câu trả lời dạng object trong danh sách
class StudentAnswerItem(BaseModel):
    question_id: UUID
    answer_data: Any


# 3. Request Nộp bài thi (Nhận linh hoạt cả Dict { q_id: ans } lẫn List [ StudentAnswerItem ])
class SubmitAttemptRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    answers: Union[Dict[str, Any], List[StudentAnswerItem], Any] = Field(default_factory=dict)


# 4. Câu hỏi trả về cho Sinh viên làm bài (BẢO MẬT: Đã lọc đáp án đúng)
class StudentQuestionView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: UUID
    question_type: str
    content: str
    data: Optional[Dict[str, Any]] = None
    points: Decimal = Decimal("1.00")


# 5. Chi tiết lượt thi
class AttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attempt_id: UUID
    exam_id: UUID
    user_id: UUID
    score: Optional[Decimal] = Decimal("0.00")
    total_points: Optional[Decimal] = Decimal("0.00")
    status: str  # IN_PROGRESS, COMPLETED, NEEDS_GRADING
    started_at: datetime
    completed_at: Optional[datetime] = None


# 6. Response khi tham gia làm bài (Join Exam)
class JoinExamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attempt_id: UUID
    exam_name: str
    duration_minutes: int
    allow_review_answers: bool = True
    started_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    saved_answers: Optional[Dict[str, Any]] = {}
    questions: List[StudentQuestionView] = []