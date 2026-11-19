from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.crud import user as crud_user
from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.profile import Profile
from app.models.status_catalog import UserStatus
from app.models.user import User
from app.schemas.user import (
    TokenResponse,
    UserCreate,
    UserLogin,
    UserRead,
    UserStatusUpdate,
    ProfileRead,
    UserProfileUpdate,
)
from app.core.security import create_access_token, verify_password
from app.core.roles import ROLE_NAMES

# Prefix /users để khớp với Frontend gọi /api/v1/users/...
router = APIRouter(prefix="/users", tags=["users"])


def to_read(user: User, session: Optional[Session] = None) -> UserRead:
    profile_obj = getattr(user, "profile", None)
    if profile_obj is None and session is not None:
        profile_obj = session.exec(
            select(Profile).where(Profile.user_id == user.user_id)
        ).first()

    profile_read = ProfileRead.model_validate(profile_obj) if profile_obj else None

    return UserRead(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        role_id=user.role_id,
        role=ROLE_NAMES.get(user.role_id, "STUDENT"),
        status_id=user.status_id,
        birthdate=user.birthdate,
        created_at=user.created_at,
        profile=profile_read,
    )


# 1. API CẤP TÀI KHOẢN GIẢNG VIÊN / INSTRUCTOR -> POST /api/v1/users/instructor
@router.post("/instructor", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_instructor(data: UserCreate, session: Session = Depends(get_db)):
    if crud_user.get_by_email(session, data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email đã được sử dụng")
    if crud_user.get_by_username(session, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Username đã được sử dụng")

    new_user = crud_user.create_user(session, data)
    return to_read(new_user, session)


# 2. API LẤY DANH SÁCH TOÀN BỘ NGƯỜI DÙNG -> GET /api/v1/users
# @router.get("", response_model=List[UserRead])
# def list_all_users(session: Session = Depends(get_db)):
#     users = crud_user.get_all_users(session)
#     return [to_read(u, session) for u in users]


# 3. API ĐỔI TRẠNG THÁI NGƯỜI DÙNG -> PATCH /api/v1/users/{user_id}/status
@router.patch("/{user_id}/status", response_model=UserRead)
def update_status(user_id: UUID, data: UserStatusUpdate, session: Session = Depends(get_db)):
    updated_user = crud_user.update_user_status(session, user_id, data.status_id)
    if not updated_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")
    return to_read(updated_user, session)


# 4. API ĐĂNG NHẬP / LOGIN -> POST /api/v1/users/login
@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, session: Session = Depends(get_db)):
    user = crud_user.get_by_email(session, data.email)
    if not user or not user.password or not verify_password(data.password, user.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Sai email hoặc mật khẩu")
    if user.status_id != UserStatus.ACTIVE.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị khóa")

    token = create_access_token(str(user.user_id), ROLE_NAMES.get(user.role_id, "STUDENT"))
    return TokenResponse(access_token=token, user=to_read(user, session))


# 5. API LẤY THÔNG TIN CÁ NHÂN -> GET /api/v1/users/me
@router.get("/me", response_model=UserRead)
def me(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    return to_read(user, session)


# 6. API ĐĂNG KÝ CÔNG KHẢI -> POST /api/v1/users/register
@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: Session = Depends(get_db)):
    if crud_user.get_by_email(session, data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email đã được sử dụng")
    if crud_user.get_by_username(session, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Username đã được sử dụng")

    new_user = crud_user.create_user(session, data)
    return to_read(new_user, session)


# 7. API CẬP NHẬT HỒ SƠ CÁ NHÂN -> PATCH /api/v1/users/me
@router.patch("/me", response_model=UserRead)
def update_me(
    data: UserProfileUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    updated_user = crud_user.update_user_profile(session, user, data)
    return to_read(updated_user, session)





import math
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.schemas.user import PaginatedUserResponse

# 2. API LẤY DANH SÁCH NGƯỜI DÙNG CÓ PHÂN TRANG -> GET /api/v1/users
@router.get("", response_model=PaginatedUserResponse)
def list_all_users(
    page: int = Query(1, ge=1, description="Trang hiện tại"),
    page_size: int = Query(20, ge=1, le=100, description="Số dòng mỗi trang"),
    search: Optional[str] = Query(None, description="Tìm username, email, họ tên"),
    role: Optional[str] = Query(None, description="ADMIN | INSTRUCTOR | STUDENT"),
    status: Optional[str] = Query(None, description="ACTIVE | BANNED"),
    session: Session = Depends(get_db),
):
    rows, total = crud_user.get_users_paginated(
        session=session,
        page=page,
        page_size=page_size,
        search=search,
        role=role,
        status=status,
    )

    items = [
        UserRead(
            user_id=u.user_id,
            username=u.username,
            email=u.email,
            role_id=u.role_id,
            role=ROLE_NAMES.get(u.role_id, "STUDENT"),
            status_id=u.status_id,
            birthdate=u.birthdate,
            created_at=u.created_at,
            profile=ProfileRead.model_validate(p) if p else None,
        )
        for u, p in rows
    ]

    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return PaginatedUserResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )