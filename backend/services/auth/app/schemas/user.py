from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ==========================================
# PROFILE SCHEMAS
# ==========================================

class ProfileCreate(BaseModel):
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class ProfileRead(ProfileCreate):
    profile_id: UUID
    user_id: UUID

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# USER SCHEMAS
# ==========================================

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)
    role_id: Optional[int] = 2  # Mặc định 3: STUDENT, truyền 2: INSTRUCTOR
    status_id: str = "ACTIVE"
    birthdate: Optional[date] = None
    
    # Hỗ trợ cả 2 cách gửi dữ liệu Profile
    first_name: Optional[str] = None  # Dành cho form Register công khai
    last_name: Optional[str] = None   # Dành cho form Register công khai
    profile: Optional[ProfileCreate] = None  # Dành cho Admin Dashboard cấp Giảng viên


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    user_id: UUID
    username: str
    email: EmailStr
    role_id: int
    role: str
    status_id: str
    birthdate: Optional[date] = None
    created_at: datetime
    profile: Optional[ProfileRead] = None  # Trả về kèm Profile nếu có

    model_config = ConfigDict(from_attributes=True)


class UserStatusUpdate(BaseModel):
    status_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead