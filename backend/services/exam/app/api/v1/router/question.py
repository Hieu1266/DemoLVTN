from typing import List, Dict, Any, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, or_

from app.api.v1.deps import get_db, get_current_user
from app.models.question import Question

router = APIRouter()


# ===================================================================
# 1. API LẤY TOÀN BỘ NGÂN HÀNG CÂU HỎI (LẬP LỊCH TRA CỨU MỞ RỘNG)
# ===================================================================
@router.get("/bank")
@router.get("/bank/")
def get_question_bank(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Chỉ lấy những câu hỏi gốc thuộc Ngân hàng câu hỏi (exam_id IS NULL)."""
    statement = select(Question).where(Question.exam_id == None)
    
    # Nếu câu hỏi có phân biệt theo owner (giảng viên)
    user_id_str = current_user.get("user_id") or current_user.get("id")
    if hasattr(Question, "owner_id") and user_id_str:
        try:
            u_uuid = UUID(str(user_id_str))
            # Lấy câu hỏi của chính giảng viên đó hoặc câu hỏi dùng chung
            statement = select(Question).where(
                Question.exam_id == None,
                or_(Question.owner_id == u_uuid, Question.owner_id == None)
            )
        except (ValueError, TypeError):
            pass

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
# 2. TẠO CÂU HỎI MỚI VÀO NGÂN HÀNG
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

    # 1. BẮT BUỘC LẤY EXAM_ID TỪ FRONTEND GỬI LÊN
    exam_id_str = payload.get("exam_id")
    exam_id = UUID(str(exam_id_str)) if exam_id_str else None

    q_type = payload.get("question_type") or payload.get("type", "single_choice")
    content = payload.get("content") or payload.get("title", "")
    points = float(payload.get("points", 1.0))
    q_data = payload.get("data") or {}

    # 2. TRUYỀN EXAM_ID VÀO DB
    new_q = Question(
        exam_id=exam_id,  # FIX Ở ĐÂY: Để bằng exam_id thay vì None
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

    # Nếu có logic kiểm tra quyền (ví dụ: chỉ người tạo mới được xóa), bạn thêm ở đây
    # user_id_str = current_user.get("user_id") or current_user.get("id")
    # if hasattr(question, "owner_id") and str(question.owner_id) != str(user_id_str):
    #     raise HTTPException(status_code=403, detail="Không có quyền xóa câu hỏi này.")

    db.delete(question)
    db.commit()
    
    return {"message": "Xóa câu hỏi thành công."}