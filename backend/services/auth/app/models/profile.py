from typing import Optional
from uuid import UUID
import uuid

from sqlmodel import SQLModel, Field


class Profile(SQLModel, table=True):
    __tablename__ = "profile"

    profile_id: UUID = Field(primary_key=True, index=True, default_factory=uuid.uuid4)
    user_id: UUID = Field(foreign_key="user.user_id", unique=True, nullable=False)
    firstname: Optional[str] = Field(default=None, max_length=100)
    lastname: Optional[str] = Field(default=None, max_length=100)
    bio: Optional[str] = Field(default=None)
    avatar_url: Optional[str] = Field(default=None, max_length=500)