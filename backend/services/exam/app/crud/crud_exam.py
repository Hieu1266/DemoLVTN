from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlmodel import Session, select
from app.models.exam import Exam
from app.models.question import Question


from datetime import datetime, timezone

def parse_dt(value: Any) -> Optional[datetime]:
    """
    Đổi chuỗi ISO thành datetime UTC chuẩn.
    Nếu chuỗi không chứa múi giờ (naive), tự động gán múi giờ địa phương (UTC+7)
    trước khi đổi sang UTC để tránh lệch 7 tiếng.
    """
    if value is None or value == "":
        return None
        
    if isinstance(value, datetime):
        dt = value
    else:
        val_str = str(value).strip()
        if val_str.endswith("Z"):
            val_str = val_str[:-1] + "+00:00"
        dt = datetime.fromisoformat(val_str)

    # 🔴 SỬA LỖI: Nếu chuỗi gửi từ Frontend chưa có Múi giờ, coi đó là giờ Local (Việt Nam UTC+7)
    if dt.tzinfo is None:
        local_tz = datetime.now().astimezone().tzinfo
        dt = dt.replace(tzinfo=local_tz)

    # Đưa về UTC chuẩn để lưu trữ DB và so sánh nhất quán
    return dt.astimezone(timezone.utc)


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

        # 3. XỬ LÝ CÂU HỎI SOẠN TRỰC TIẾP (INLINE_QUESTIONS): LƯU ĐỒNG THỜI VÀO NGÂN HÀNG & ĐỀ THI
        inline_questions = data.get("inline_questions", [])
        for inline_q in inline_questions:
            q_dict = inline_q.model_dump() if hasattr(inline_q, "model_dump") else dict(inline_q)
            q_type = q_dict.get("question_type", "single_choice")
            q_content = q_dict.get("content", "")
            q_pts = float(q_dict.get("points", 1.0))
            q_data = q_dict.get("data", {})

            # 3a. Lưu 1 bản vào Ngân hàng câu hỏi (exam_id = None)
            bank_q = Question(
                exam_id=None,
                question_type=q_type,
                content=q_content,
                points=q_pts,
                data=q_data
            )
            _set_model_field(bank_q, ["owner_id", "user_id", "created_by"], final_owner_id)
            db.add(bank_q)

            # 3b. Gắn 1 bản sao trực tiếp vào Đề thi này (exam_id = db_exam.exam_id)
            exam_q = Question(
                exam_id=db_exam.exam_id,
                question_type=q_type,
                content=q_content,
                points=q_pts,
                data=q_data
            )
            _set_model_field(exam_q, ["owner_id", "user_id", "created_by"], final_owner_id)
            db.add(exam_q)

        db.commit()
        db.refresh(db_exam)
        return db_exam


crud_exam = CRUDExam()