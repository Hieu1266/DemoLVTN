from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.crud import user as crud_user
from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.status_catalog import UserStatus
from app.models.user import User
from app.schemas.user import TokenResponse, UserCreate, UserLogin, UserRead
from app.core.security import create_access_token, verify_password
from app.core.roles import ROLE_NAMES

router = APIRouter(prefix="/auth", tags=["auth"])


def to_read(user: User) -> UserRead:
    return UserRead(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        role=ROLE_NAMES[user.role_id],
        status_id=user.status_id,
        birthdate=user.birthdate,
        created_at=user.created_at,
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: Session = Depends(get_db)):
    if crud_user.get_by_email(session, data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email đã được sử dụng")
    if crud_user.get_by_username(session, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username đã được sử dụng")
    return to_read(crud_user.create_user(session, data))


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, session: Session = Depends(get_db)):
    user = crud_user.get_by_email(session, data.email)
    if not user or not user.password or not verify_password(data.password, user.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai email hoặc mật khẩu")
    if user.status_id != UserStatus.ACTIVE.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị khóa")

    token = create_access_token(str(user.user_id), ROLE_NAMES[user.role_id])
    return TokenResponse(access_token=token, user=to_read(user))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return to_read(user)