from typing import List, Optional
from uuid import UUID
from sqlmodel import Session, select

from app.core.roles import ROLES
from app.core.security import hash_password
from app.models.profile import Profile
from app.models.user import User
from app.schemas.user import UserCreate


# ==========================================
# READ OPERATIONS
# ==========================================

def get_by_email(session: Session, email: str) -> Optional[User]:
    return session.exec(select(User).where(User.email == email)).first()


def get_by_username(session: Session, username: str) -> Optional[User]:
    return session.exec(select(User).where(User.username == username)).first()


def get_by_id(session: Session, user_id: UUID) -> Optional[User]:
    return session.get(User, user_id)


def get_all_users(session: Session) -> List[User]:
    return session.exec(select(User)).all()


def get_profile_by_user_id(session: Session, user_id: UUID) -> Optional[Profile]:
    return session.exec(select(Profile).where(Profile.user_id == user_id)).first()


# ==========================================
# CREATE & UPDATE OPERATIONS
# ==========================================

def create_user(session: Session, data: UserCreate) -> User:
    """
    Hàm tạo user tổng quát (Dùng cho cả Admin cấp Giảng viên và Đăng ký Sinh viên).
    Hỗ trợ linh hoạt cả trường profile lồng (data.profile) hoặc first_name/last_name trực tiếp.
    """
    # Xử lý role_id: Ưu tiên role_id trong data gửi lên, mặc định là STUDENT nếu không truyền
    role_id = getattr(data, "role_id", ROLES.get("STUDENT", 3))
    status_id = getattr(data, "status_id", "ACTIVE")

    # 1. Khởi tạo đối tượng User
    user = User(
        username=data.username,
        email=data.email,
        password=hash_password(data.password),
        role_id=role_id,
        status_id=status_id,
        birthdate=getattr(data, "birthdate", None),
    )
    session.add(user)
    session.flush()  # Flush để sinh user_id kết nối khóa ngoại Profile

    # 2. Khởi tạo đối tượng Profile
    # Trường hợp A: Có object profile lồng (UserCreate từ Admin Dashboard)
    if hasattr(data, "profile") and data.profile:
        profile = Profile(
            user_id=user.user_id,
            firstname=data.profile.firstname,
            lastname=data.profile.lastname,
            bio=getattr(data.profile, "bio", None),
            avatar_url=getattr(data.profile, "avatar_url", None),
        )
        session.add(profile)

    # Trường hợp B: Có first_name / last_name trực tiếp ở root (Form Register công khai)
    elif hasattr(data, "first_name") or hasattr(data, "last_name"):
        profile = Profile(
            user_id=user.user_id,
            firstname=getattr(data, "first_name", None),
            lastname=getattr(data, "last_name", None),
        )
        session.add(profile)

    session.commit()
    session.refresh(user)
    return user


def update_user_status(session: Session, user_id: UUID, status_id: str) -> Optional[User]:
    """Cập nhật trạng thái người dùng (ACTIVE, UNACTIVE, BANNED)."""
    user = session.get(User, user_id)
    if user:
        user.status_id = status_id
        session.add(user)
        session.commit()
        session.refresh(user)
    return user