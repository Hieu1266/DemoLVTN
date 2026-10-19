from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from app.core.roles import ROLES
from app.core.security import hash_password
from app.models.profile import Profile
from app.models.user import User
from app.schemas.user import UserCreate


def get_by_email(session: Session, email: str) -> Optional[User]:
    return session.exec(select(User).where(User.email == email)).first()


def get_by_username(session: Session, username: str) -> Optional[User]:
    return session.exec(select(User).where(User.username == username)).first()


def get_by_id(session: Session, user_id: UUID) -> Optional[User]:
    return session.get(User, user_id)


def create_user(session: Session, data: UserCreate) -> User:
    user = User(
        role_id=ROLES["STUDENT"],  # đăng ký công khai chỉ dành cho sinh viên
        username=data.username,
        email=data.email,
        password=hash_password(data.password),
        birthdate=data.birthdate,
    )
    session.add(user)
    session.flush()  # lấy user_id để tạo profile

    session.add(Profile(user_id=user.user_id, firstname=data.first_name, lastname=data.last_name))
    session.commit()
    session.refresh(user)
    return user