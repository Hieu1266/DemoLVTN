from fastapi import APIRouter
from app.api.v1.router import question, exam, attempt

api_router = APIRouter()
api_router.include_router(question.router, prefix="/questions", tags=["Questions"])
api_router.include_router(exam.router, prefix="/exams", tags=["Exams"])
api_router.include_router(attempt.router, prefix="/attempts", tags=["Attempts & Grading"])