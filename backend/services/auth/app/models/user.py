from typing import Optional
from uuid import UUID
import uuid
from datetime import datetime, date, timezone

from pydantic import EmailStr
from sqlmodel import SQLModel, Field

from app.models.status_catalog import UserStatus


class User(SQLModel, table=True):
    __tablename__ = "user"

    user_id: UUID = Field(primary_key=True, index=True, default_factory=uuid.uuid4)
    role_id: int = Field(foreign_key="role.role_id", nullable=False, index=True)
    username: str = Field(nullable=False, max_length=50, index=True)
    email: EmailStr = Field(unique=True, nullable=False)
    password: Optional[str] = Field(nullable=True)  # lưu bcrypt hash
    birthdate: Optional[date] = Field(nullable=True, default=None)
    created_at: datetime = Field(nullable=False, default_factory=lambda: datetime.now(timezone.utc))
    status_id: str = Field(
        foreign_key="status_catalog.status_id",
        nullable=False,
        default=UserStatus.ACTIVE.value,
    )