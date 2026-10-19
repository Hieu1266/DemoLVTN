from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    UNACTIVE = "UNACTIVE"
    BANNED = "BANNED"


class StatusCatalog(SQLModel, table=True):
    __tablename__ = "status_catalog"

    status_id: str = Field(primary_key=True, max_length=30)
    status_key: UserStatus = Field(nullable=False)
    display_name: str = Field(nullable=False, max_length=100)
    description: Optional[str] = Field(default=None, nullable=True)