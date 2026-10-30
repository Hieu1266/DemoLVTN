from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.v1.deps import get_db, get_current_user
from app.crud.crud_exam import crud_exam
from app.crud.crud_attempt import crud_attempt
from app.models.attempt import Attempt
from app.models.attempt_answer import AttemptAnswer
from app.models.exam import Exam
from app.models.question import Question
from app.schemas.attempt import (
    JoinExamRequest,
    JoinExamResponse,
    SubmitAttemptRequest,
    AttemptResponse
)

router = APIRouter()


def _get_attr(obj: Any, candidates: List[str], default: Any = None) -> Any:
    if not obj:
        return default
    for attr in candidates:
        if hasattr(obj, attr):
            return getattr(obj, attr)
    return default


def calculate_ends_at(started_at: Optional[datetime], duration_minutes: int) -> Optional[datetime]:
    if started_at and duration_minutes:
        return started_at + timedelta(minutes=duration_minutes)
    return None


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ép kiểu datetime về UTC chuẩn xác."""
    if not dt:
        return None
    if dt.tzinfo is None:
        # Nếu DB trả về naive datetime, coi đó là giờ địa phương Server
        local_tz = datetime.now().astimezone().tzinfo
        dt = dt.replace(tzinfo=local_tz)
    return dt.astimezone(timezone.utc)


def _get_max_attempts(exam: Any) -> Optional[int]:
    """Truy xuất an toàn số lần thi tối đa."""
    if not exam:
        return None

    for attr in ["max_attempts", "allowed_attempts", "attempts_limit", "max_attempt"]:
        val = getattr(exam, attr, None)
        if val is not None:
            try:
                v = int(val)
                return None if v < 0 else v
            except (ValueError, TypeError):
                pass

    for dict_attr in ["settings", "data", "config"]:
        config_dict = getattr(exam, dict_attr, None)
        if isinstance(config_dict, dict):
            for key in ["max_attempts", "allowed_attempts", "attempts_limit"]:
                val = config_dict.get(key)
                if val is not None:
                    try:
                        v = int(val)
                        return None if v < 0 else v
                    except (ValueError, TypeError):
                        pass

    return None 


# ===================================================================
# 1. THAM GIA THI (RÀNG BUỘC START_AT, END_AT & MAX_ATTEMPTS)
# ===================================================================
@router.post("/join", response_model=JoinExamResponse)
def join_exam(
    req: JoinExamRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Sinh viên nhập mã PIN để tham gia phòng thi (Kèm kiểm tra thời gian mở/đóng đề)."""
    user_id = UUID(current_user["user_id"])
    clean_code = req.access_code.strip() if req.access_code else ""
    
    exam = crud_exam.get_by_access_code(db, access_code=clean_code)
    if not exam:
        statement = select(Exam).where(Exam.access_code.ilike(clean_code))
        exam = db.exec(statement).first()

    if not exam:
        raise HTTPException(
            status_code=404, 
            detail=f"Mã PIN bài thi '{req.access_code}' không hợp lệ hoặc không tồn tại!"
        )

    # 1. KIỂM TRA TRẠNG THÁI ĐỀ THI
    status_str = str(getattr(exam, "status_id", getattr(exam, "status", ""))).upper()
    if status_str not in ["PUBLISHED", "ACTIVE", "READY", ""]:
        raise HTTPException(status_code=400, detail="Đề thi chưa được mở hoặc đã bị đóng!")

    # 2. KIỂM TRA THỜI GIAN MỞ/ĐÓNG ĐỀ THI
    now_utc = datetime.now(timezone.utc)
    start_at_utc = _ensure_utc(getattr(exam, "start_at", None))
    end_at_utc = _ensure_utc(getattr(exam, "end_at", None))

    # Nếu chưa đến giờ mở đề -> Chặn ngay
    if start_at_utc and now_utc < start_at_utc:
        # Chuyển về giờ địa phương để thông báo sinh viên
        start_local = start_at_utc.astimezone().strftime("%H:%M ngày %d/%m/%Y")
        raise HTTPException(
            status_code=400,
            detail=f"Đề thi chưa đến giờ mở! Vui lòng quay lại vào lúc {start_local}."
        )

    # Nếu đã quá giờ đóng đề -> Chặn ngay
    if end_at_utc and now_utc > end_at_utc:
        end_local = end_at_utc.astimezone().strftime("%H:%M ngày %d/%m/%Y")
        raise HTTPException(
            status_code=400,
            detail=f"Phòng thi đã đóng cửa vào lúc {end_local}. Bạn không thể tham gia nữa!"
        )

    # 3. LẤY DANH SÁCH LƯỢT THI CỦA SINH VIÊN
    user_attempts = db.exec(
        select(Attempt).where(
            Attempt.user_id == user_id,
            Attempt.exam_id == exam.exam_id
        ).order_by(Attempt.started_at.asc())
    ).all()

    # Nếu có lượt thi đang làm dang dở (IN_PROGRESS) -> Cho làm tiếp
    active_attempt = next((a for a in user_attempts if a.status == "IN_PROGRESS"), None)
    if active_attempt:
        questions = crud_exam.get_exam_questions(db, exam_id=exam.exam_id)
        resp = JoinExamResponse(
            attempt_id=active_attempt.attempt_id,
            exam_name=exam.exam_name,
            duration_minutes=exam.duration_minutes,
            allow_review_answers=exam.allow_review_answers,
            started_at=active_attempt.started_at,
            ends_at=calculate_ends_at(active_attempt.started_at, exam.duration_minutes),
            saved_answers=_get_attr(active_attempt, ["saved_answers", "draft_answers"], {}) or {},
            questions=questions
        )
        db.close()   # trả kết nối cho PgBouncer ngay, không chờ dependency dọn dẹp
        return resp

    # Đếm các lượt thi đã hoàn thành
    completed_attempts = [a for a in user_attempts if a.status in ["COMPLETED", "NEEDS_GRADING", "SUBMITTED", "FINISHED"]]
    completed_count = len(completed_attempts)

    # 4. KIỂM TRA GIỚI HẠN SỐ LẦN THI (MAX_ATTEMPTS)
    max_attempts = _get_max_attempts(exam)

    if max_attempts is not None and max_attempts > 0:
        if completed_count >= max_attempts:
            raise HTTPException(
                status_code=400,
                detail=f"Bạn đã sử dụng hết {completed_count}/{max_attempts} lần làm bài thi cho phép!"
            )

    # 5. Tạo lượt thi mới
    attempt, questions = crud_attempt.create_attempt(db, user_id=user_id, exam=exam)
    resp = JoinExamResponse(
        attempt_id=attempt.attempt_id,
        exam_name=exam.exam_name,
        duration_minutes=exam.duration_minutes,
        allow_review_answers=exam.allow_review_answers,
        started_at=attempt.started_at,
        ends_at=calculate_ends_at(attempt.started_at, exam.duration_minutes),
        saved_answers={},
        questions=questions
    )
    db.close()
    return resp


# ===================================================================
# 2. DANH SÁCH BÀI ĐÃ THI
# ===================================================================
@router.get("/my-results")
@router.get("/my-history")
def get_my_attempts(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = UUID(current_user["user_id"])
    
    history_asc = db.exec(
        select(Attempt, Exam)
        .where(Attempt.user_id == user_id)
        .outerjoin(Exam, Attempt.exam_id == Exam.exam_id)
        .order_by(Attempt.started_at.asc())
    ).all()

    exam_counts: Dict[str, int] = {}
    attempt_ordinal: Dict[str, int] = {}

    for attempt, exam in history_asc:
        e_id = str(attempt.exam_id)
        exam_counts[e_id] = exam_counts.get(e_id, 0) + 1
        attempt_ordinal[str(attempt.attempt_id)] = exam_counts[e_id]

    formatted_history = []
    for attempt, exam in reversed(history_asc):
        score_val = _get_attr(attempt, ["score", "total_score", "earned_score"], 0.0)
        max_val = _get_attr(attempt, ["total_points", "max_score", "max_points"], 10.0)
        time_val = _get_attr(attempt, ["completed_at", "submitted_at", "ended_at", "started_at"])
        allow_review = exam.allow_review_answers if exam else True

        e_id = str(attempt.exam_id)
        ord_num = attempt_ordinal.get(str(attempt.attempt_id), 1)
        total_times = exam_counts.get(e_id, 1)

        base_name = exam.exam_name if exam else "Bài thi"
        display_name = f"{base_name} (Lần {ord_num})" if total_times > 1 else base_name

        formatted_history.append({
            "attempt_id": str(attempt.attempt_id),
            "exam_id": e_id,
            "exam_name": display_name,
            "score": float(score_val) if score_val is not None else 0.0,
            "total_score": float(score_val) if score_val is not None else 0.0,
            "total_points": float(max_val) if max_val is not None else 10.0,
            "max_score": float(max_val) if max_val is not None else 10.0,
            "submitted_at": time_val,
            "completed_at": time_val,
            "status": attempt.status,
            "review_allowed": allow_review,
            "allow_review_answers": allow_review
        })

    return formatted_history


# ===================================================================
# 3. CHI TIẾT KẾT QUẢ BÀI THI
# ===================================================================
@router.get("/{attempt_id}/result")
def get_attempt_result(
    attempt_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    attempt = crud_attempt.get_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài làm thi!")

    exam = crud_exam.get_by_id(db, exam_id=attempt.exam_id)
    allow_review = exam.allow_review_answers if exam else True

    answers = db.exec(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt_id)
    ).all()

    questions = db.exec(
        select(Question).where(Question.exam_id == attempt.exam_id)
    ).all()

    ans_map = {a.question_id: a for a in answers}

    detailed_answers = []
    has_pending = False

    for q in questions:
        student_ans = ans_map.get(q.question_id)

        ans_value = None
        earned_pts = 0.0
        is_corr = None

        if student_ans:
            ans_value = (
                getattr(student_ans, "student_answer", None)
                or getattr(student_ans, "answer_data", None)
                or getattr(student_ans, "user_answer", None)
                or getattr(student_ans, "answer", None)
            )
            earned_pts = getattr(student_ans, "earned_points", getattr(student_ans, "points_earned", 0.0)) or 0.0
            is_corr = getattr(student_ans, "is_correct", None)

        q_type = str(q.question_type or "").lower()

        if q_type in ["essay", "fill_blank", "fill_in_blank", "fill_blank_text", "fill_blank_select"]:
            if is_corr is not True and is_corr is not False:
                is_corr = None
                has_pending = True

        q_max_pts = float(q.points) if q.points is not None else 1.0
        q_earned = float(earned_pts) if earned_pts is not None else 0.0

        detailed_answers.append({
            "question_id": str(q.question_id),
            "question_type": q.question_type,
            "content": q.content,
            "options": (q.data or {}).get("options", []),
            "points": q_max_pts,
            "max_points": q_max_pts,
            "student_answer": ans_value,
            "user_answer": ans_value,
            "answer": ans_value,
            "earned_points": q_earned,
            "points_earned": q_earned,
            "score": q_earned,
            "is_correct": is_corr
        })

    score_val = _get_attr(attempt, ["score", "total_score", "earned_score", "final_score"], 0.0)
    total_val = _get_attr(attempt, ["total_points", "max_score", "max_points"], 10.0)
    completed_time = _get_attr(attempt, ["completed_at", "submitted_at", "ended_at", "started_at"])

    status_str = getattr(attempt, "status", "COMPLETED")
    if has_pending or status_str == "NEEDS_GRADING":
        status_str = "NEEDS_GRADING"

    score_num = float(score_val) if score_val is not None else 0.0
    total_num = float(total_val) if total_val is not None else 10.0

    result = {
        "attempt_id": str(attempt.attempt_id),
        "exam_name": exam.exam_name if exam else "Bài thi",
        "score": score_num,
        "total_score": score_num,
        "total_points": total_num,
        "max_score": total_num,
        "status": status_str,
        "completed_at": completed_time,
        "submitted_at": completed_time,
        "allow_review_answers": allow_review,
        "review_allowed": allow_review,
        "answers": detailed_answers if allow_review else None
    }
    db.close()
    return result


@router.get("/{attempt_id}", response_model=JoinExamResponse)
def get_attempt_detail(
    attempt_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    attempt = crud_attempt.get_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt làm bài thi!")

    exam = crud_exam.get_by_id(db, exam_id=attempt.exam_id)
    questions = crud_exam.get_exam_questions(db, exam_id=attempt.exam_id)
    duration = exam.duration_minutes if exam else 60

    resp = JoinExamResponse(
        attempt_id=attempt.attempt_id,
        exam_name=exam.exam_name if exam else "Bài thi",
        duration_minutes=duration,
        allow_review_answers=exam.allow_review_answers if exam else True,
        started_at=attempt.started_at,
        ends_at=calculate_ends_at(attempt.started_at, duration),
        saved_answers=_get_attr(attempt, ["saved_answers", "draft_answers"], {}) or {},
        questions=questions
    )
    db.close()
    return resp


@router.put("/{attempt_id}/draft")
def save_attempt_draft(
    attempt_id: UUID,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    attempt = crud_attempt.get_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt làm bài thi!")

    answers = payload.get("answers", payload)
    crud_attempt.save_draft(db, attempt=attempt, answers=answers)
    db.close()
    return {"status": "success", "message": "Đã lưu nháp thành công"}


@router.post("/{attempt_id}/submit", response_model=AttemptResponse)
def submit_exam(
    attempt_id: UUID,
    submit_data: SubmitAttemptRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = UUID(current_user["user_id"])
    attempt = crud_attempt.get_by_id(db, attempt_id)

    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt thi!")

    if str(attempt.user_id) != str(user_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền nộp bài thi này!")

    result = crud_attempt.process_submit(db, attempt=attempt, submit_data=submit_data)
    db.close()
    return result