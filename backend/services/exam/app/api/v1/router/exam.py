from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

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


def _get_users_map(db: Session, user_ids: List[UUID], auth_header: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    user_map = {}
    if not user_ids:
        return user_map

    str_ids = {str(uid) for uid in user_ids}

    # -------------------------------------------------------------------
    # 1. TRUY VẤN CƠ SỞ DỮ LIỆU (Thử tất cả các cấu trúc bảng & cột)
    # -------------------------------------------------------------------
    from sqlalchemy import text

    queries = [
        'SELECT id::text, username, email, full_name FROM "user"',
        'SELECT id::text, username, email, full_name FROM users',
        'SELECT id::text, username, email, username FROM "user"',
        'SELECT id::text, username, email, username FROM users',
        'SELECT user_id::text, username, email, full_name FROM "user"',
        'SELECT user_id::text, username, email, full_name FROM users',
    ]

    for q in queries:
        try:
            res = db.execute(text(q)).fetchall()
            if res:
                for row in res:
                    uid_str = str(row[0])
                    user_map[uid_str] = {
                        "username": row[1],
                        "email": row[2] or "",
                        "full_name": row[3] or row[1],
                    }
                print(f"✅ [DEBUG] Lấy thành công {len(user_map)} users từ DB bằng query: {q}")
                if str_ids.issubset(set(user_map.keys())):
                    return user_map
        except Exception:
            db.rollback()  # Bắt buộc rollback để tránh hỏng transaction SQLAlchemy

    # -------------------------------------------------------------------
    # 2. GỌI HTTP SANG AUTH SERVICE (Port 8000) NẾU TÁCH DB MICROSERVICES
    # -------------------------------------------------------------------
    import urllib.request
    import json
    import os

    auth_base_url = os.getenv("AUTH_SERVICE_URL", "http://localhost:8000/api/v1")
    headers = {"Content-Type": "application/json"}
    if auth_header:
        headers["Authorization"] = auth_header

    # Thử lấy toàn bộ danh sách User từ Auth Service
    list_endpoints = ["/users/", "/users", "/user/", "/user"]
    for ep in list_endpoints:
        try:
            url = f"{auth_base_url}{ep}"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    if isinstance(data, list):
                        for u in data:
                            uid = str(u.get("id") or u.get("user_id") or "")
                            if uid:
                                user_map[uid] = {
                                    "username": u.get("username"),
                                    "full_name": u.get("full_name") or u.get("first_name") or u.get("username"),
                                    "email": u.get("email"),
                                }
                        print(f"✅ [DEBUG] Lấy thành công {len(user_map)} users từ Auth API List: {url}")
                        if str_ids.issubset(set(user_map.keys())):
                            return user_map
        except Exception as e:
            print(f"⚠️ [DEBUG] Lỗi gọi Auth API List ({ep}): {e}")

    # Thử lấy chi tiết từng User nếu danh sách trên chưa có
    for uid_str in str_ids:
        if uid_str in user_map:
            continue
        detail_endpoints = [f"/users/{uid_str}", f"/users/id/{uid_str}", f"/users/by-id/{uid_str}"]
        for ep in detail_endpoints:
            try:
                url = f"{auth_base_url}{ep}"
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=2) as response:
                    if response.status == 200:
                        data = json.loads(response.read().decode())
                        user_map[uid_str] = {
                            "username": data.get("username"),
                            "full_name": data.get("full_name") or data.get("first_name") or data.get("username"),
                            "email": data.get("email"),
                        }
                        print(f"✅ [DEBUG] Lấy user {uid_str} từ Auth API Detail: {url}")
                        break
            except Exception as e:
                print(f"⚠️ [DEBUG] Lỗi gọi Auth API Detail ({ep}): {e}")

    return user_map
# ===================================================================
# 1. QUẢN LÝ ĐỀ THI (CRUD)
# ===================================================================

# ===================================================================
# 1. QUẢN LÝ ĐỀ THI (CRUD)
# ===================================================================

@router.get("", response_model=None)
@router.get("/")
def get_all_exams(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy danh sách đề thi (Tự động phân quyền: Admin thấy hết, Giảng viên chỉ thấy đề của mình)."""
    user_id_str = current_user.get("user_id") or current_user.get("id") or current_user.get("sub")
    role = str(current_user.get("role") or current_user.get("role_id") or "").upper()

    # Nếu người dùng là Giảng viên (INSTRUCTOR), lọc danh sách theo user_id
    if role == "INSTRUCTOR" and user_id_str:
        try:
            uid = UUID(str(user_id_str))
            return crud_exam.get_instructor_exams(db, instructor_id=uid)
        except (ValueError, TypeError):
            pass

    # Nếu là ADMIN hoặc trường hợp khác, lấy toàn bộ danh sách
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
    """
    Cập nhật thông tin đề thi & chuyển đổi trạng thái (DRAFT / PUBLISHED / CLOSED).
    """
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
# 2. DANH SÁCH BÀI NỘP CỦA SINH VIÊN (SUBMISSIONS LIST)
# ===================================================================

@router.get("/{exam_id}/submissions")
def get_exam_submissions(
    exam_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy danh sách các bài thi đã nộp của sinh viên theo đề thi."""
    exam = crud_exam.get_by_id(db, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề thi!")

    statement = (
        select(Attempt)
        .where(Attempt.exam_id == exam_id, Attempt.status != "IN_PROGRESS")
        .order_by(Attempt.started_at.desc())
    )
    attempts = db.exec(statement).all()

    # Truy vấn danh sách người dùng để lấy username thật
    user_ids = [att.user_id for att in attempts if att.user_id]
    user_map = _get_users_map(db, user_ids)

    submissions = []
    for att in attempts:
        score_val = _get_attr(att, ["score", "total_score", "earned_score"], 0.0)
        max_val = _get_attr(att, ["total_points", "max_score", "max_points"], 10.0)
        submitted_time = _get_attr(att, ["completed_at", "submitted_at", "ended_at", "started_at"])

        short_uid = str(att.user_id)[:8]
        u_info = user_map.get(str(att.user_id), {})
        
        uname = u_info.get("username")
        fname = u_info.get("full_name")
        uemail = u_info.get("email")

        default_name = f"Sinh viên #{short_uid}"
        student_name = fname or uname or default_name
        username = uname or student_name
        student_email = uemail or f"student_{short_uid}@lumer.edu.vn"

        score_num = float(score_val) if score_val is not None else 0.0
        max_num = float(max_val) if max_val is not None else 10.0

        submissions.append({
            "id": str(att.attempt_id),
            "attempt_id": str(att.attempt_id),
            "exam_id": str(att.exam_id),
            "user_id": str(att.user_id),
            "student_id": str(att.user_id),
            "username": username,
            "student_name": student_name,
            "full_name": student_name,
            "name": student_name,
            "student_email": student_email,
            "email": student_email,
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
# 3. CHI TIẾT 1 BÀI NỘP ĐỂ GIẢNG VIÊN CHẤM TAY
# ===================================================================

@router.get("/{exam_id}/submissions/{attempt_id}")
@router.get("/submissions/{attempt_id}")
def get_submission_detail_for_grading(
    attempt_id: UUID,
    exam_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lấy chi tiết bài làm kèm câu hỏi và đáp án sinh viên để chấm bài."""
    attempt = crud_attempt.get_by_id(db, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài làm thi!")

    exam = crud_exam.get_by_id(db, exam_id=attempt.exam_id)
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

    # Lấy thông tin user
    u_map = _get_users_map(db, [attempt.user_id] if attempt.user_id else [])
    u_info = u_map.get(str(attempt.user_id), {})

    short_uid = str(attempt.user_id)[:8]
    uname = u_info.get("username")
    fname = u_info.get("full_name")
    uemail = u_info.get("email")

    default_name = f"Sinh viên #{short_uid}"
    student_name = fname or uname or default_name
    username = uname or student_name
    student_email = uemail or f"student_{short_uid}@lumer.edu.vn"

    score_num = float(score_val) if score_val is not None else 0.0
    max_num = float(max_val) if max_val is not None else 10.0

    return {
        "id": str(attempt.attempt_id),
        "attempt_id": str(attempt.attempt_id),
        "exam_id": str(attempt.exam_id),
        "exam_name": exam.exam_name if exam else "Bài thi",
        "username": username,
        "student_name": student_name,
        "full_name": student_name,
        "name": student_name,
        "student_email": student_email,
        "email": student_email,
        "user_id": str(attempt.user_id),
        "student": {
            "id": str(attempt.user_id),
            "username": username,
            "full_name": student_name,
            "name": student_name,
            "email": student_email,
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
            raw_earned = Decimal(str(grade_item.get("earned_points", grade_item.get("score", 0))))
            
            # 🔴 CHẶN LỖI: Điểm chấm không được nhỏ hơn 0 và không được vượt quá điểm tối đa của câu hỏi (q.points)
            max_q_pts = Decimal(str(q.points if q.points is not None else 1.0))
            earned = min(max_q_pts, max(Decimal("0.00"), raw_earned))

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
        # 🔴 CHẶN LỖI: Điểm tổng thang 10 không bao giờ vượt quá 10.00
        scaled_score = min(Decimal("10.00"), max(Decimal("0.00"), round(scaled_score, 2)))
    else:
        scaled_score = Decimal("0.00")

    _set_model_field(attempt, ["total_score", "score", "earned_score"], scaled_score)
    attempt.status = "COMPLETED"

    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return {"status": "success", "message": "Đã lưu điểm chấm bài thành công!", "final_score": float(scaled_score)}