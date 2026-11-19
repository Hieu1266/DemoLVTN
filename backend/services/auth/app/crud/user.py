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


from sqlmodel import Session, select
from app.models.profile import Profile
from app.models.user import User
from app.schemas.user import UserProfileUpdate


def update_user_profile(session: Session, user: User, data: UserProfileUpdate) -> User:
    # Lấy bản ghi user gắn với session hiện tại
    db_user = session.get(User, user.user_id) or user

    if data.birthdate is not None:
        db_user.birthdate = data.birthdate

    # Truy vấn trực tiếp bảng profile thay vì gọi user.profile
    profile = session.exec(
        select(Profile).where(Profile.user_id == db_user.user_id)
    ).first()

    if not profile:
        profile = Profile(user_id=db_user.user_id)

    if data.firstname is not None:
        profile.firstname = data.firstname
    if data.lastname is not None:
        profile.lastname = data.lastname
    if data.bio is not None:
        profile.bio = data.bio
    if data.avatar_url is not None:
        profile.avatar_url = data.avatar_url

    session.add(db_user)
    session.add(profile)
    session.commit()
    session.refresh(db_user)
    return db_user



from typing import Dict, List, Optional, Tuple
from uuid import UUID
from sqlalchemy import func, or_, text
from sqlmodel import Session, col, select

from app.models.profile import Profile
from app.models.user import User

ROLE_STR_TO_ID = {
    "ADMIN": 1,
    "INSTRUCTOR": 2,
    "STUDENT": 3,
}


def get_users_paginated(
    session: Session,
    page: int = 1,
    page_size: int = 100,
    search: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
) -> Tuple[List[Tuple[User, Optional[Profile]]], int]:
    has_search = bool(search and search.strip())
    has_role = bool(role and role.upper() in ROLE_STR_TO_ID)
    has_status = bool(status and status.upper() != "ALL")
    has_filters = has_search or has_role or has_status

    stmt = select(User)

    # Chỉ JOIN profile khi người dùng thực sự nhập từ khóa tìm kiếm
    if has_search:
        kw = f"%{search.strip()}%"
        stmt = stmt.outerjoin(Profile, Profile.user_id == User.user_id).where(
            or_(
                col(User.username).ilike(kw),
                col(User.email).ilike(kw),
                col(Profile.firstname).ilike(kw),
                col(Profile.lastname).ilike(kw),
            )
        )

    if has_role:
        stmt = stmt.where(User.role_id == ROLE_STR_TO_ID[role.upper()])

    if has_status:
        stmt = stmt.where(User.status_id == status.upper())

    # 1. Đếm tổng số dòng (Dùng thống kê hệ thống Postgres nếu không lọc để tránh quét triệu dòng)
    if not has_filters:
        approx = session.connection().execute(
            text("SELECT reltuples::bigint FROM pg_class WHERE relname = 'user'")
        ).scalar()
        if approx is not None and approx > 0:
            total = int(approx)
        else:
            total = session.exec(select(func.count(col(User.user_id)))).one()
    else:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = session.exec(count_stmt).one()

    # 2. Lấy đúng 100 user của trang hiện tại
    offset = (page - 1) * page_size
    users = session.exec(
        stmt.order_by(col(User.created_at).desc()).offset(offset).limit(page_size)
    ).all()

    if not users:
        return [], total

    # 3. Lấy profile của đúng 100 user vừa tải (1 câu query IN cực nhẹ)
    user_ids: List[UUID] = [u.user_id for u in users]
    profiles = session.exec(
        select(Profile).where(col(Profile.user_id).in_(user_ids))
    ).all()
    profile_map: Dict[UUID, Profile] = {p.user_id: p for p in profiles}

    rows = [(u, profile_map.get(u.user_id)) for u in users]
    return rows, total