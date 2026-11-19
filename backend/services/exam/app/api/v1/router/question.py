from typing import List, Dict, Any, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select, or_

from app.api.v1.deps import get_db, get_current_user
from app.models.question import Question

router = APIRouter()


# ===================================================================
# 1. API LẤY TOÀN BỘ NGÂN HÀNG CÂU HỎI (CÓ LỌC & TÌM KIẾM)
# ===================================================================
@router.get("/bank")
@router.get("/bank/")
def get_question_bank(
    type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Chỉ lấy những câu hỏi gốc thuộc Ngân hàng câu hỏi (exam_id IS NULL)."""
    conditions = [Question.exam_id == None]

    user_id_str = current_user.get("user_id") or current_user.get("id")
    if hasattr(Question, "owner_id") and user_id_str:
        try:
            u_uuid = UUID(str(user_id_str))
            conditions.append(or_(Question.owner_id == u_uuid, Question.owner_id == None))
        except (ValueError, TypeError):
            pass

    if type and type != "ALL":
        conditions.append(Question.question_type == type)

    if search and search.strip():
        conditions.append(Question.content.ilike(f"%{search.strip()}%"))

    statement = select(Question).where(*conditions)
    questions = db.exec(statement).all()

    formatted_questions = []
    for q in questions:
        q_data = q.data or {}
        q_id_str = str(q.question_id)

        formatted_questions.append({
            "id": q_id_str,
            "question_id": q_id_str,
            "question_type": q.question_type,
            "type": q.question_type,
            "content": q.content,
            "title": q.content,
            "points": float(q.points) if q.points is not None else 1.0,
            "data": q_data,
            "options": q_data.get("options", []),
            "statements": q_data.get("statements", []),
            "blanks": q_data.get("blanks", []),
            "sample_answer": q_data.get("sample_answer", "") or q_data.get("explanation", ""),
            "explanation": q_data.get("explanation", "") or q_data.get("sample_answer", ""),
        })

    return formatted_questions


# ===================================================================
# 2. TẠO CÂU HỎI MỚI VÀO NGÂN HÀNG HOẶC ĐỀ THI
# ===================================================================
@router.post("")
@router.post("/")
def create_bank_question(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id_str = current_user.get("user_id") or current_user.get("id")
    owner_id = UUID(str(user_id_str)) if user_id_str else None

    exam_id_str = payload.get("exam_id")
    exam_id = UUID(str(exam_id_str)) if exam_id_str else None

    q_type = payload.get("question_type") or payload.get("type", "single_choice")
    content = payload.get("content") or payload.get("title", "")
    points = float(payload.get("points", 1.0))
    q_data = payload.get("data") or {}

    new_q = Question(
        exam_id=exam_id,
        question_type=q_type,
        content=content,
        points=points,
        data=q_data
    )

    if hasattr(new_q, "owner_id") and owner_id:
        setattr(new_q, "owner_id", owner_id)

    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return new_q


# ===================================================================
# 3. CẬP NHẬT CÂU HỎI TRONG NGÂN HÀNG
# ===================================================================
@router.put("/{question_id}")
@router.patch("/{question_id}")
def update_question(
    question_id: UUID,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cập nhật nội dung, loại câu hỏi, thang điểm và đáp án của câu hỏi."""
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy câu hỏi."
        )

    if "question_type" in payload or "type" in payload:
        question.question_type = payload.get("question_type") or payload.get("type")

    if "content" in payload or "title" in payload:
        question.content = payload.get("content") or payload.get("title")

    if "points" in payload and payload["points"] is not None:
        question.points = float(payload["points"])

    if "data" in payload and payload["data"] is not None:
        question.data = payload["data"]

    db.add(question)
    db.commit()
    db.refresh(question)
    return question


# ===================================================================
# 4. XÓA CÂU HỎI
# ===================================================================
@router.delete("/{question_id}")
def delete_question(
    question_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Xóa một câu hỏi theo ID."""
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy câu hỏi."
        )

    db.delete(question)
    db.commit()
    return {"message": "Xóa câu hỏi thành công."}