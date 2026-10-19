from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone
from sqlmodel import Session, select, col
from app.models.question import Question
from app.schemas.question import QuestionCreate, QuestionUpdate


class CRUDQuestion:
    def get_by_id(self, db: Session, question_id: UUID) -> Optional[Question]:
        return db.get(Question, question_id)

    def get_bank_questions(
        self,
        db: Session,
        owner_id: UUID,
        skip: int = 0,
        limit: int = 100,
        question_type: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Question]:
        """Lấy danh sách câu hỏi trong Ngân hàng (exam_id IS NULL) của giảng viên."""
        statement = select(Question).where(
            Question.owner_id == owner_id,
            Question.exam_id == None
        )

        if question_type and question_type != "ALL":
            statement = statement.where(Question.question_type == question_type)
        if search:
            statement = statement.where(col(Question.content).contains(search))

        statement = statement.offset(skip).limit(limit).order_by(Question.created_at.desc())
        return db.exec(statement).all()

    def create(self, db: Session, obj_in: QuestionCreate, owner_id: UUID) -> Question:
        db_obj = Question(
            owner_id=owner_id,
            exam_id=obj_in.exam_id,
            question_type=obj_in.question_type.value,
            content=obj_in.content,
            data=obj_in.data,
            points=obj_in.points,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, db_obj: Question, obj_in: QuestionUpdate) -> Question:
        update_data = obj_in.model_dump(exclude_unset=True)
        if "question_type" in update_data and update_data["question_type"]:
            update_data["question_type"] = update_data["question_type"].value

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        
        db_obj.updated_at = datetime.now(timezone.utc)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, db_obj: Question) -> None:
        db.delete(db_obj)
        db.commit()


crud_question = CRUDQuestion()