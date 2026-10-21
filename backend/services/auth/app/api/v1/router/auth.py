from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.crud import user as crud_user
from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.status_catalog import UserStatus
from app.models.user import User
from app.schemas.user import TokenResponse, UserCreate, UserLogin, UserRead, UserStatusUpdate, ProfileRead
from app.core.security import create_access_token, verify_password
from app.core.roles import ROLE_NAMES

# Đổi prefix thành /users để khớp 100% với Frontend gọi /api/v1/users/...
router = APIRouter(prefix="/users", tags=["users"])


def to_read(user: User) -> UserRead:
    # Lấy profile trực tiếp từ relationship nếu có
    profile_read = ProfileRead.model_validate(user.profile) if getattr(user, "profile", None) else None

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
    return to_read(new_user)  # FIX: Bỏ tham số 'session' thừa


# 2. API LẤY DANH SÁCH TOÀN BỘ NGƯỜI DÙNG -> GET /api/v1/users
@router.get("", response_model=List[UserRead])
def list_all_users(session: Session = Depends(get_db)):
    users = crud_user.get_all_users(session)
    return [to_read(u) for u in users]  # FIX: Bỏ tham số 'session' thừa


# 3. API ĐỔI TRẠNG THÁI NGƯỜI DÙNG -> PATCH /api/v1/users/{user_id}/status
@router.patch("/{user_id}/status", response_model=UserRead)
def update_status(user_id: UUID, data: UserStatusUpdate, session: Session = Depends(get_db)):
    updated_user = crud_user.update_user_status(session, user_id, data.status_id)
    if not updated_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")
    return to_read(updated_user)  # FIX: Bỏ tham số 'session' thừa


# 4. API ĐĂNG NHẬP / LOGIN -> POST /api/v1/users/login
@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, session: Session = Depends(get_db)):
    user = crud_user.get_by_email(session, data.email)
    if not user or not user.password or not verify_password(data.password, user.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Sai email hoặc mật khẩu")
    if user.status_id != UserStatus.ACTIVE.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị khóa")

    token = create_access_token(str(user.user_id), ROLE_NAMES.get(user.role_id, "STUDENT"))
    return TokenResponse(access_token=token, user=to_read(user))


# 5. API LẤY THÔNG TIN CÁ NHÂN -> GET /api/v1/users/me
@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return to_read(user)


# 6. API ĐĂNG KÝ CÔNG KHẢI -> POST /api/v1/users/register
@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: Session = Depends(get_db)):
    if crud_user.get_by_email(session, data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email đã được sử dụng")
    if crud_user.get_by_username(session, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Username đã được sử dụng")
    
    new_user = crud_user.create_user(session, data)
    return to_read(new_user)