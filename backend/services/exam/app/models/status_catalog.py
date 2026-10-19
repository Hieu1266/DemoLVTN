from enum import Enum
from typing import Optional
from sqlmodel import SQLModel, Field


class ExamStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class StatusCatalog(SQLModel, table=True):
    __tablename__ = "status_catalog"

    status_id: str = Field(primary_key=True, max_length=30)
    status_name: str = Field(nullable=False, max_length=50)
    description: Optional[str] = Field(default=None, nullable=True)