from typing import Optional

from sqlmodel import SQLModel, Field


class Role(SQLModel, table=True):
    __tablename__ = "role"

    role_id: int = Field(primary_key=True, index=True)
    role_name: str = Field(unique=True, nullable=False, max_length=50)
    description: Optional[str] = Field(default=None, nullable=True)