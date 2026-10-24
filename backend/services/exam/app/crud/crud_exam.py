from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlmodel import Session, select
from app.models.exam import Exam
from app.models.question import Question


def parse_dt(value: Any) -> Optional[datetime]:
    """Đổi chuỗi ISO (vd '2026-10-24T12:24:00.000Z') thành datetime có múi giờ.

    Frontend gửi start_at/end_at dạng chuỗi; cột TIMESTAMP WITH TIME ZONE của SQLModel
    bắt buộc nhận datetime, nếu đưa chuỗi sẽ lỗi 'str' object has no attribute 'utcoffset'.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _set_model_field(obj: Any, candidates: List[str], value: Any) -> Optional[str]:
    """Gán giá trị an toàn vào field tồn tại trong SQLModel."""
    fields = getattr(obj, "model_fields", {})
    for field in candidates:
        if field in fields or hasattr(obj, field):
            setattr(obj, field, value)
            return field
    return None


class CRUDExam:
    def get_by_id(self, db: Session, exam_id: UUID) -> Optional[Exam]:
        return db.get(Exam, exam_id)

    def get_by_access_code(self, db: Session, access_code: str) -> Optional[Exam]:
        clean_code = access_code.strip() if access_code else ""
        statement = select(Exam).where(Exam.access_code.ilike(clean_code))
        return db.exec(statement).first()

    def get_exam_questions(self, db: Session, exam_id: UUID) -> List[Question]:
        statement = select(Question).where(Question.exam_id == exam_id)
        return db.exec(statement).all()

    def create_exam(self, db: Session, payload: Any, owner_id: Optional[UUID] = None) -> Exam:
        """Tạo đề thi mới, gắn owner_id cho bài thi và toàn bộ câu hỏi được clone/tạo mới."""
        data = payload.model_dump() if hasattr(payload, "model_dump") else (payload if isinstance(payload, dict) else {})

        final_owner_id = owner_id or data.get("owner_id") or data.get("user_id")
        if isinstance(final_owner_id, str):
            final_owner_id = UUID(final_owner_id)

        # 1. Khởi tạo đối tượng Exam
        db_exam = Exam(
            exam_name=data.get("exam_name"),
            access_code=str(data.get("access_code", "")).upper().strip(),
            duration_minutes=int(data.get("duration_minutes", 60)),
            allow_review_answers=bool(data.get("allow_review_answers", True)),
            status_id=str(data.get("status_id", "DRAFT"))
        )

        _set_model_field(db_exam, ["owner_id", "user_id", "created_by"], final_owner_id)
        _set_model_field(db_exam, ["start_at", "started_at", "opening_at"], parse_dt(data.get("start_at")))
        _set_model_field(db_exam, ["end_at", "ended_at", "closing_at"], parse_dt(data.get("end_at")))
        _set_model_field(db_exam, ["max_attempts", "allowed_attempts", "attempts_limit"], data.get("max_attempts"))

        db.add(db_exam)
        db.commit()
        db.refresh(db_exam)

        # 2. XỬ LÝ CÂU HỎI NGÂN HÀNG: CLONE CÂU HỎI KÈM OWNER_ID
        question_ids = data.get("question_ids", [])
        for q_id in question_ids:
            try:
                q_uuid = UUID(str(q_id))
                bank_q = db.get(Question, q_uuid)
                if bank_q:
                    # Lấy owner_id từ câu hỏi gốc hoặc lấy owner_id của bài thi
                    q_owner = getattr(bank_q, "owner_id", None) or final_owner_id

                    cloned_q = Question(
                        exam_id=db_exam.exam_id,
                        question_type=bank_q.question_type,
                        content=bank_q.content,
                        points=bank_q.points,
                        data=bank_q.data
                    )
                    _set_model_field(cloned_q, ["owner_id", "user_id", "created_by"], q_owner)
                    db.add(cloned_q)
            except (ValueError, TypeError):
                continue

        # 3. XỬ LÝ CÂU HỎI SOẠN TRỰC TIẾP (INLINE_QUESTIONS) KÈM OWNER_ID
        inline_questions = data.get("inline_questions", [])
        for inline_q in inline_questions:
            q_dict = inline_q.model_dump() if hasattr(inline_q, "model_dump") else dict(inline_q)
            new_q = Question(
                exam_id=db_exam.exam_id,
                question_type=q_dict.get("question_type", "single_choice"),
                content=q_dict.get("content", ""),
                points=float(q_dict.get("points", 1.0)),
                data=q_dict.get("data", {})
            )
            _set_model_field(new_q, ["owner_id", "user_id", "created_by"], final_owner_id)
            db.add(new_q)

        db.commit()
        db.refresh(db_exam)
        return db_exam


crud_exam = CRUDExam()