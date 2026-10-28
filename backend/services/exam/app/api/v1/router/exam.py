from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from sqlalchemy import text

from app.api.v1.deps import get_db, get_current_user
from app.crud.crud_exam import crud_exam, parse_dt
from app.crud.crud_attempt import crud_attempt
from app.models.exam import Exam
from app.models.attempt import Attempt
from app.models.attempt_answer import AttemptAnswer
from app.models.question import Question

router = APIRouter()


def _get_attr(obj: Any, candidates: List[str], default: Any = None) -> Any:
    if not obj:
        return default
    for attr in candidates:
        if hasattr(obj, attr):
            val = getattr(obj, attr)
            if val is not None:
                return val
    return default


def _set_model_field(obj: Any, candidates: List[str], value: Any) -> Optional[str]:
    fields = getattr(obj, "model_fields", {})
    for field in candidates:
        if field in fields or hasattr(obj, field):
            setattr(obj, field, value)
            return field
    return None


# ===================================================================
# 1. QUẢN LÝ ĐỀ THI (CRUD)
# ===================================================================

@router.get("", response_model=None)
@router.get("/")
def get_all_exams(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy danh sách tất cả đề thi."""
    statement = select(Exam)
    if hasattr(Exam, "created_at"):
        statement = statement.order_by(Exam.created_at.desc())
    exams = db.exec(statement).all()
    return exams


@router.post("", response_model=None)
@router.post("/")
def create_new_exam(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Tạo mới đề thi kèm owner_id từ tài khoản đăng nhập."""
    user_id_str = current_user.get("user_id") or current_user.get("id") or current_user.get("sub")
    owner_id = UUID(str(user_id_str)) if user_id_str else None
    return crud_exam.create_exam(db, payload=payload, owner_id=owner_id)


@router.get("/{exam_id}")
def get_exam_by_id(
    exam_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy thông tin chi tiết đề thi kèm danh sách câu hỏi."""
    exam = crud_exam.get_by_id(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề thi!")

    questions = crud_exam.get_exam_questions(db, exam_id=exam_id)
    exam_dict = exam.model_dump() if hasattr(exam, "model_dump") else dict(exam)
    exam_dict["questions"] = questions
    return exam_dict


@router.put("/{exam_id}")
@router.patch("/{exam_id}")
def update_exam_by_id(
    exam_id: UUID,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cập nhật thông tin đề thi."""
    exam = crud_exam.get_by_id(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề thi để cập nhật!")

    for key, value in payload.items():
        if hasattr(exam, key):
            if key in ("start_at", "end_at"):
                value = parse_dt(value)
            setattr(exam, key, value)
            
    if hasattr(exam, "updated_at"):
        setattr(exam, "updated_at", datetime.now(timezone.utc))

    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@router.delete("/{exam_id}")
def delete_exam_by_id(exam_id: UUID, db: Session = Depends(get_db)):
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Không tìm thấy đề thi."
        )

    if hasattr(exam, "status") and exam.status in ["PUBLISHED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đề thi đã được triển khai hoặc đã đóng. Vui lòng không xóa!"
        )

    has_attempt = db.exec(
        select(Attempt).where(Attempt.exam_id == exam_id)
    ).first()

    if has_attempt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Đề thi đã có sinh viên làm bài, không thể xóa để bảo toàn dữ liệu!"
        )

    db.delete(exam)
    db.commit()

    return {"message": "Xóa đề thi thành công."}


# ===================================================================
# 2. DANH SÁCH BÀI NỘP (TỰ ĐỘNG LẤY USERNAME & EMAIL TỪ BẢNG "user")
# ===================================================================

@router.get("/{exam_id}/submissions")
def get_exam_submissions(
    exam_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy danh sách các bài thi đã nộp kèm thông tin Username/Email."""
    exam = crud_exam.get_by_id(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề thi!")

    statement = (
        select(Attempt)
        .where(Attempt.exam_id == exam_id, Attempt.status != "IN_PROGRESS")
        .order_by(Attempt.started_at.desc())
    )
    attempts = db.exec(statement).all()

    # Lấy danh sách user_id dạng string
    user_ids = list({str(att.user_id) for att in attempts if att.user_id})
    user_map = {}

    if user_ids:
        try:
            # Query an toàn 100% bằng IN + bindparams + ::text casting
            sql = text('SELECT user_id::text, username, email FROM "user" WHERE user_id::text IN :uids').bindparams(expanding=True)
            rows = db.execute(sql, {"uids": user_ids}).fetchall()
            for row in rows:
                user_map[str(row[0])] = {
                    "username": row[1],
                    "email": row[2]
                }
        except Exception:
            db.rollback()  # Khôi phục Session nếu có sự cố SQL

    submissions = []
    for att in attempts:
        score_val = _get_attr(att, ["score", "total_score", "earned_score"], 0.0)
        max_val = _get_attr(att, ["total_points", "max_score", "max_points"], 10.0)
        submitted_time = _get_attr(att, ["completed_at", "submitted_at", "ended_at", "started_at"])

        short_uid = str(att.user_id)[:8]
        u_info = user_map.get(str(att.user_id), {})

        username = u_info.get("username")
        email = u_info.get("email") or f"student_{short_uid}@lumer.edu.vn"
        display_name = username or f"Sinh viên #{short_uid}"

        score_num = float(score_val) if score_val is not None else 0.0
        max_num = float(max_val) if max_val is not None else 10.0

        submissions.append({
            "id": str(att.attempt_id),
            "attempt_id": str(att.attempt_id),
            "exam_id": str(att.exam_id),
            "user_id": str(att.user_id),
            "student_id": str(att.user_id),
            "username": username or display_name,
            "student_name": display_name,
            "full_name": display_name,
            "name": display_name,
            "student_email": email,
            "email": email,
            "score": score_num,
            "total_score": score_num,
            "earned_score": score_num,
            "final_score": score_num,
            "max_score": max_num,
            "total_points": max_num,
            "status": att.status,
            "submitted_at": submitted_time,
            "completed_at": submitted_time,
        })

    return submissions


# ===================================================================
# 3. CHI TIẾT 1 BÀI NỘP DÙNG ĐỂ CHẤM BÀI
# ===================================================================

@router.get("/{exam_id}/submissions/{attempt_id}")
@router.get("/submissions/{attempt_id}")
def get_submission_detail_for_grading(
    attempt_id: UUID,
    exam_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy chi tiết bài làm kèm câu hỏi và đáp án sinh viên."""
    attempt = crud_attempt.get_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài làm thi!")

    exam = crud_exam.get_by_id(db, exam_id=attempt.exam_id)

    # Lấy thông tin User an toàn bằng SQL direct
    u_info = {}
    if attempt.user_id:
        try:
            sql = text('SELECT username, email FROM "user" WHERE user_id::text = :uid')
            row = db.execute(sql, {"uid": str(attempt.user_id)}).fetchone()
            if row:
                u_info = {"username": row[0], "email": row[1]}
        except Exception:
            db.rollback()  # Khôi phục Session nếu có sự cố SQL

    short_uid = str(attempt.user_id)[:8]
    username = u_info.get("username")
    email = u_info.get("email") or f"student_{short_uid}@lumer.edu.vn"
    display_name = username or f"Sinh viên #{short_uid}"

    answers = db.exec(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
    ).all()

    questions = db.exec(
        select(Question).where(Question.exam_id == attempt.exam_id)
    ).all()

    ans_map = {a.question_id: a for a in answers}
    detailed_items = []

    for q in questions:
        student_ans = ans_map.get(q.question_id)
        ans_value = _get_attr(student_ans, ["student_answer", "answer_data", "user_answer", "answer"])
        earned_pts = _get_attr(student_ans, ["earned_points", "points_earned", "score"], 0.0)
        is_corr = _get_attr(student_ans, ["is_correct", "correct"], None)

        q_max_pts = float(q.points) if q.points is not None else 1.0
        q_earned = float(earned_pts) if earned_pts is not None else 0.0
        q_data = q.data or {}

        detailed_items.append({
            "id": str(q.question_id),
            "question_id": str(q.question_id),
            "question_type": q.question_type,
            "type": q.question_type,
            "content": q.content,
            "title": q.content,
            "question_title": q.content,
            "question_content": q.content,
            "question": {
                "id": str(q.question_id),
                "content": q.content,
                "title": q.content,
                "type": q.question_type,
                "question_type": q.question_type,
                "points": q_max_pts,
                "data": q_data,
            },
            "data": q_data,
            "options": q_data.get("options", []),
            "statements": q_data.get("statements", []),
            "blanks": q_data.get("blanks", []),
            "sample_answer": q_data.get("sample_answer", "") or q_data.get("explanation", ""),
            "explanation": q_data.get("explanation", "") or q_data.get("sample_answer", ""),
            "points": q_max_pts,
            "max_points": q_max_pts,
            "student_answer": ans_value,
            "user_answer": ans_value,
            "answer": ans_value,
            "answer_data": ans_value,
            "earned_points": q_earned,
            "points_earned": q_earned,
            "score": q_earned,
            "is_correct": is_corr,
            "correct": is_corr,
        })

    score_val = _get_attr(attempt, ["score", "total_score", "earned_score"], 0.0)
    max_val = _get_attr(attempt, ["total_points", "max_score", "max_points"], 10.0)
    submitted_time = _get_attr(attempt, ["completed_at", "submitted_at", "ended_at", "started_at"])

    score_num = float(score_val) if score_val is not None else 0.0
    max_num = float(max_val) if max_val is not None else 10.0

    return {
        "id": str(attempt.attempt_id),
        "attempt_id": str(attempt.attempt_id),
        "exam_id": str(attempt.exam_id),
        "exam_name": exam.exam_name if exam else "Bài thi",
        "username": username or display_name,
        "student_name": display_name,
        "full_name": display_name,
        "name": display_name,
        "student_email": email,
        "email": email,
        "user_id": str(attempt.user_id),
        "student": {
            "id": str(attempt.user_id),
            "username": username or display_name,
            "full_name": display_name,
            "name": display_name,
            "email": email,
        },
        "score": score_num,
        "total_score": score_num,
        "earned_score": score_num,
        "final_score": score_num,
        "max_score": max_num,
        "total_points": max_num,
        "status": attempt.status,
        "submitted_at": submitted_time,
        "completed_at": submitted_time,
        "answers": detailed_items,
        "questions": detailed_items,
        "details": detailed_items,
        "attempt_answers": detailed_items,
    }


# ===================================================================
# 4. GIẢNG VIÊN LƯU ĐIỂM CHẤM TAY (SAVE GRADES)
# ===================================================================

@router.post("/{exam_id}/submissions/{attempt_id}/grade")
@router.post("/submissions/{attempt_id}/grade")
@router.put("/submissions/{attempt_id}/grade")
def grade_submission(
    attempt_id: UUID,
    payload: Dict[str, Any],
    exam_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Giảng viên chấm điểm câu tự luận/điền khuyết và cập nhật lại điểm thi."""
    attempt = crud_attempt.get_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài làm!")

    grades = payload.get("grades", payload.get("answers", {}))

    answers = db.exec(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
    ).all()
    ans_map = {str(a.question_id): a for a in answers}

    questions = db.exec(
        select(Question).where(Question.exam_id == attempt.exam_id)
    ).all()
    q_map = {str(q.question_id): q for q in questions}

    total_earned_raw = Decimal("0.00")
    total_possible_raw = Decimal("0.00")

    for q_id, q in q_map.items():
        total_possible_raw += q.points
        ans = ans_map.get(q_id)

        if q_id in grades and ans:
            grade_item = grades[q_id]
            earned = Decimal(str(grade_item.get("earned_points", grade_item.get("score", 0))))
            is_corr = grade_item.get("is_correct", True if earned > 0 else False)

            _set_model_field(ans, ["earned_points", "points_earned", "score"], earned)
            _set_model_field(ans, ["is_correct", "correct"], is_corr)
            db.add(ans)
            total_earned_raw += earned
        elif ans:
            earned = Decimal(str(_get_attr(ans, ["earned_points", "points_earned", "score"], 0)))
            total_earned_raw += earned

    if total_possible_raw > Decimal("0.00"):
        scaled_score = (total_earned_raw / total_possible_raw) * Decimal("10.00")
        scaled_score = round(scaled_score, 2)
    else:
        scaled_score = Decimal("0.00")

    _set_model_field(attempt, ["total_score", "score", "earned_score"], scaled_score)
    attempt.status = "COMPLETED"

    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return {"status": "success", "message": "Đã lưu điểm chấm bài thành công!", "final_score": float(scaled_score)}