from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.api.v1.routers import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Chạy khởi tạo database khi service start
    init_db()
    yield


app = FastAPI(
    title="Exam Microservice",
    lifespan=lifespan
)

if settings.all_cors_origins():
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix="/api/v1")