from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.crud import user as crud_user
from app.core.database import get_db
from app.models.status_catalog import UserStatus
from app.models.user import User
from app.core.security import decode_token
from app.core.roles import ROLE_NAMES

bearer = HTTPBearer()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    session: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(creds.credentials)
        user_id = UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ hoặc đã hết hạn")

    user = crud_user.get_by_id(session, user_id)
    if not user or user.status_id != UserStatus.ACTIVE.value:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại hoặc bị khóa")
    return user


def require_role(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if ROLE_NAMES.get(user.role_id) not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Không đủ quyền truy cập")
        return user

    return checker