from typing import List, Optional, Tuple, Dict, Any, Union
from uuid import UUID
from datetime import datetime, timezone
from decimal import Decimal
from sqlmodel import Session, select

from app.models.attempt import Attempt
from app.models.attempt_answer import AttemptAnswer
from app.models.exam import Exam
from app.models.question import Question
from app.core.grading import grade_question
from app.schemas.attempt import SubmitAttemptRequest, StudentQuestionView


def _set_model_field(obj: Any, candidates: List[str], value: Any) -> Optional[str]:
    """Gán giá trị an toàn vào field tồn tại trong SQLModel."""
    fields = getattr(obj, "model_fields", {})
    for field in candidates:
        if field in fields:
            setattr(obj, field, value)
            return field
    return None


class CRUDAttempt:
    def get_by_id(self, db: Session, attempt_id: UUID) -> Optional[Attempt]:
        return db.get(Attempt, attempt_id)

    def get_active_attempt(self, db: Session, user_id: UUID, exam_id: UUID) -> Optional[Attempt]:
        statement = select(Attempt).where(
            Attempt.user_id == user_id,
            Attempt.exam_id == exam_id,
            Attempt.status == "IN_PROGRESS"
        )
        return db.exec(statement).first()

    def create_attempt(self, db: Session, user_id: UUID, exam: Exam) -> Tuple[Attempt, List[StudentQuestionView]]:
        db_attempt = Attempt(
            user_id=user_id,
            exam_id=exam.exam_id,
            status="IN_PROGRESS",
            started_at=datetime.now(timezone.utc)
        )
        db.add(db_attempt)
        db.commit()
        db.refresh(db_attempt)

        raw_questions = db.exec(
            select(Question).where(Question.exam_id == exam.exam_id)
        ).all()

        sanitized_questions = []
        for q in raw_questions:
            q_data = (q.data or {}).copy()
            if "options" in q_data:
                q_data["options"] = [{"id": opt.get("id"), "text": opt.get("text")} for opt in q_data["options"]]
            if "statements" in q_data:
                q_data["statements"] = [{"id": stmt.get("id"), "text": stmt.get("text")} for stmt in q_data["statements"]]
            if "blanks" in q_data:
                q_data["blanks"] = [{"id": b.get("id"), "type": b.get("type")} for b in q_data["blanks"]]
            q_data.pop("sample_answer", None)
            q_data.pop("explanation", None)

            sanitized_questions.append(
                StudentQuestionView(
                    question_id=q.question_id,
                    question_type=q.question_type,
                    content=q.content,
                    data=q_data,
                    points=q.points
                )
            )

        return db_attempt, sanitized_questions

    def save_draft(self, db: Session, attempt: Attempt, answers: Any) -> Attempt:
        draft_dict = answers
        if hasattr(answers, "answers"):
            draft_dict = answers.answers
        elif isinstance(answers, dict) and "answers" in answers:
            draft_dict = answers["answers"]

        _set_model_field(attempt, ["saved_answers", "draft_answers", "answers"], draft_dict or {})
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        return attempt

    def process_submit(self, db: Session, attempt: Attempt, submit_data: Any) -> Attempt:
        # 1. Trích xuất dictionary câu trả lời từ payload nộp bài
        raw_answers = submit_data.answers if hasattr(submit_data, "answers") else submit_data
        if not isinstance(raw_answers, dict) and isinstance(raw_answers, list):
            # Chuyển dạng list thành dict {question_id: answer}
            ans_dict = {}
            for item in raw_answers:
                q_id = item.get("question_id") or item.get("id") if isinstance(item, dict) else getattr(item, "question_id", None)
                val = item.get("student_answer") or item.get("answer") if isinstance(item, dict) else getattr(item, "student_answer", None)
                if q_id:
                    ans_dict[str(q_id)] = val
            raw_answers = ans_dict

        # 2. Lưu trực tiếp vào trường saved_answers của Attempt
        _set_model_field(attempt, ["saved_answers", "draft_answers", "answers"], raw_answers or {})

        # 3. Đồng bộ chi tiết vào bảng AttemptAnswer
        questions = db.exec(select(Question).where(Question.exam_id == attempt.exam_id)).all()
        
        # Xóa câu trả lời cũ của attempt_id này nếu có
        old_answers = db.exec(select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.attempt_id)).all()
        for old in old_answers:
            db.delete(old)

        total_earned_raw = Decimal("0.00")
        total_possible_raw = Decimal("0.00")
        has_manual_grading = False

        for q in questions:
            q_id_str = str(q.question_id)
            total_possible_raw += q.points

            # Lấy câu trả lời của học viên
            student_ans = raw_answers.get(q_id_str) if isinstance(raw_answers, dict) else None
            if student_ans is None and isinstance(raw_answers, dict):
                student_ans = raw_answers.get(q.question_id)

            q_type = str(q.question_type or "").lower()
            q_data = q.data or {}
            q_mode = str(q_data.get("mode", "")).lower()

            # ------------------------------------------------------------------
            # PHÂN LOẠI CHẤM ĐIỂM:
            # 1. Tự luận (essay) & Điền khuyết gõ tay (fill_blank_text / mode == "text"): Giữ chờ chấm tay
            # 2. Điền khuyết chọn trắc nghiệm (fill_blank_select / mode == "select"): Chấm tự động 100%
            # ------------------------------------------------------------------
            is_essay = (q_type == "essay")
            is_text_blank = (q_type == "fill_blank_text") or (q_type in ["fill_blank", "fill_in_blank"] and q_mode == "text")

            if is_essay or is_text_blank:
                has_manual_grading = True
                earned = Decimal("0.00")
                is_correct = None
            else:
                earned, is_correct, needs_manual = grade_question(
                    question_type=q.question_type,
                    question_data=q_data,
                    question_points=q.points,
                    student_answer=student_ans
                )
                if needs_manual:
                    has_manual_grading = True

            total_earned_raw += earned

            db_ans = AttemptAnswer(
                attempt_id=attempt.attempt_id,
                question_id=q.question_id
            )
            _set_model_field(db_ans, ["student_answer", "answer_data", "user_answer"], student_ans)
            _set_model_field(db_ans, ["earned_points", "points_earned", "score"], earned)
            _set_model_field(db_ans, ["is_correct", "correct"], is_correct)
            db.add(db_ans)

        # Tính điểm quy đổi Thang 10
        if total_possible_raw > Decimal("0.00"):
            scaled_score = round((total_earned_raw / total_possible_raw) * Decimal("10.00"), 2)
        else:
            scaled_score = Decimal("0.00")

        _set_model_field(attempt, ["total_score", "score", "earned_score"], scaled_score)
        attempt.status = "NEEDS_GRADING" if has_manual_grading else "COMPLETED"
        _set_model_field(attempt, ["completed_at", "submitted_at"], datetime.now(timezone.utc))

        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        return attempt

    def get_user_history(self, db: Session, user_id: UUID) -> List[Attempt]:
        statement = select(Attempt).where(Attempt.user_id == user_id).order_by(Attempt.started_at.desc())
        return db.exec(statement).all()


crud_attempt = CRUDAttempt()