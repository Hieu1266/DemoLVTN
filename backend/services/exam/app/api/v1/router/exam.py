import os
import urllib.parse
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select
from sqlalchemy import create_engine, text, func

from app.core.config import settings
from app.api.v1.deps import get_db, get_current_user
from app.crud.crud_exam import crud_exam, parse_dt
from app.crud.crud_attempt import crud_attempt
from app.models.exam import Exam
from app.models.attempt import Attempt
from app.models.attempt_answer import AttemptAnswer
from app.models.question import Question

router = APIRouter()

# -------------------------------------------------------------------
# KẾT NỐI PHỤ ĐẾN DATABASE users_ssl_db
# -------------------------------------------------------------------
def _get_user_db_engine():
    raw_url = (
        getattr(settings, "EXAM_DB_URL", None)
        or getattr(settings, "DATABASE_URL", None)
        or os.getenv("EXAM_DB_URL")
        or os.getenv("DATABASE_URL")
        or "postgresql://postgres:postgres@postgres:5432/exams_ssl_db"
    )
    try:
        parsed = urllib.parse.urlparse(raw_url)
        user_parsed = parsed._replace(path="/users_ssl_db")
        user_db_url = urllib.parse.urlunparse(user_parsed)
        return create_engine(user_db_url, pool_pre_ping=True)
    except Exception as e:
        print(f"⚠️ [USER_DB] Không thể tạo URL engine kết nối users_ssl_db: {e}", flush=True)
        return None

user_db_engine = _get_user_db_engine()


def _get_users_map_from_db(user_ids: List[UUID]) -> Dict[str, Dict[str, Any]]:
    user_map = {}
    if not user_ids:
        return user_map

    valid_uids = list({str(uid) for uid in user_ids if uid})
    if not valid_uids:
        return user_map

    if user_db_engine:
        try:
            formatted_uids = ", ".join([f"'{uid}'" for uid in valid_uids])
            queries = [
                f'SELECT user_id::text, username, email FROM "user" WHERE user_id::text IN ({formatted_uids})',
                f'SELECT id::text, username, email FROM "user" WHERE id::text IN ({formatted_uids})',
                f'SELECT user_id::text, username, email FROM users WHERE user_id::text IN ({formatted_uids})',
                f'SELECT id::text, username, email FROM users WHERE id::text IN ({formatted_uids})',
            ]
            with user_db_engine.connect() as conn:
                for q in queries:
                    try:
                        rows = conn.execute(text(q)).fetchall()
                        if rows:
                            for r in rows:
                                uid_str = str(r[0])
                                user_map[uid_str] = {
                                    "username": r[1],
                                    "email": r[2] or f"student_{uid_str[:8]}@lumer.edu.vn"
                                }
                            return user_map
                    except Exception:
                        pass
        except Exception as e:
            print(f"⚠️ [USER_DB] Lỗi truy vấn users_ssl_db: {e}", flush=True)

    return user_map


def _resolve_answer_text(ans_value: Any, options: List[Any]) -> Any:
    """Ánh xạ mã option (opt_...) sang nội dung hiển thị chữ thật cho sinh viên/giảng viên."""
    if ans_value is None or ans_value == "":
        return ans_value
    
    if not isinstance(options, list) or not options:
        return ans_value

    opt_map = {}
    for opt in options:
        if isinstance(opt, dict):
            opt_id = str(opt.get("id") or opt.get("value") or opt.get("key") or opt.get("code") or "").strip()
            opt_text = opt.get("text") or opt.get("content") or opt.get("title") or opt.get("label") or opt_id
            if opt_id:
                opt_map[opt_id] = opt_text

    if not opt_map:
        return ans_value

    # Nếu ans_value là chuỗi đại diện 1 ID
    if isinstance(ans_value, str):
        val_str = ans_value.strip()
        if val_str in opt_map:
            return opt_map[val_str]
        if "," in val_str:
            parts = [p.strip() for p in val_str.split(",")]
            if any(p in opt_map for p in parts):
                return ", ".join([str(opt_map.get(p, p)) for p in parts])

    # Nếu ans_value là danh sách các ID (chọn nhiều)
    if isinstance(ans_value, list):
        resolved_list = [opt_map.get(str(v).strip(), v) for v in ans_value]
        return ", ".join([str(x) for x in resolved_list])

    return ans_value


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
    user_id_str = current_user.get("user_id") or current_user.get("id") or current_user.get("sub")
    owner_id = UUID(str(user_id_str)) if user_id_str else None
    return crud_exam.create_exam(db, payload=payload, owner_id=owner_id)


@router.get("/{exam_id}")
def get_exam_by_id(
    exam_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
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
# 2. DANH SÁCH BÀI NỘP CỦA SINH VIÊN
# ===================================================================

@router.get("/{exam_id}/submissions")
def get_exam_submissions(
    exam_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    exam = crud_exam.get_by_id(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề thi!")

    filters = [Attempt.exam_id == exam_id, Attempt.status != "IN_PROGRESS"]

    if status_filter and status_filter.upper() != "ALL":
        st = status_filter.upper()
        if st == "NEEDS_GRADING":
            filters.append(Attempt.status.in_(["NEEDS_GRADING", "SUBMITTED"]))
        elif st in ["DONE", "COMPLETED"]:
            filters.append(Attempt.status.in_(["COMPLETED", "GRADED", "DONE"]))

    total_items = db.exec(select(func.count(Attempt.attempt_id)).where(*filters)).one() or 0

    offset_val = (page - 1) * page_size
    statement = (
        select(Attempt)
        .where(*filters)
        .order_by(Attempt.started_at.desc())
        .offset(offset_val)
        .limit(page_size)
    )
    attempts = db.exec(statement).all()

    uids = [att.user_id for att in attempts if att.user_id]
    user_map = _get_users_map_from_db(uids)

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

    total_pages = (total_items + page_size - 1) // page_size if page_size > 0 else 1

    return {
        "items": submissions,
        "total": total_items,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ===================================================================
# 3. CHI TIẾT 1 BÀI NỘP ĐỂ GIẢNG VIÊN CHẤM TAY (ĐÃ MAP MÃ ĐÁP ÁN)
# ===================================================================

@router.get("/{exam_id}/submissions/{attempt_id}")
@router.get("/submissions/{attempt_id}")
def get_submission_detail_for_grading(
    attempt_id: UUID,
    exam_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    attempt = crud_attempt.get_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài làm thi!")

    exam = crud_exam.get_by_id(db, exam_id=attempt.exam_id)

    u_map = _get_users_map_from_db([attempt.user_id] if attempt.user_id else [])
    u_info = u_map.get(str(attempt.user_id), {})

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
        q_options = q_data.get("options", [])

        # Ánh xạ mã opt_... thành nội dung hiển thị thực tế
        resolved_ans_value = _resolve_answer_text(ans_value, q_options)

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
            "options": q_options,
            "statements": q_data.get("statements", []),
            "blanks": q_data.get("blanks", []),
            "sample_answer": q_data.get("sample_answer", "") or q_data.get("explanation", ""),
            "explanation": q_data.get("explanation", "") or q_data.get("sample_answer", ""),
            "points": q_max_pts,
            "max_points": q_max_pts,
            "raw_student_answer": ans_value,
            "student_answer": resolved_ans_value,
            "student_answer_text": resolved_ans_value,
            "user_answer": resolved_ans_value,
            "answer": resolved_ans_value,
            "answer_data": resolved_ans_value,
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