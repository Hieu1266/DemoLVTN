# from typing import Generator, Dict, Any
# from fastapi import Depends, HTTPException, status
# from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
# import jwt
# from sqlmodel import Session

# from app.core.database import engine
# from app.core.config import settings

# security = HTTPBearer()

# # redis_client = redis.Redis(host="redis", port=6379, db=0, decode_responses=True)

# # def get_redis():
# #     return redis_client


# def get_db() -> Generator[Session, None, None]:
#     # expire_on_commit=False: sau commit vẫn đọc được thuộc tính mà không phải SELECT lại
#     # (SELECT lại = xin thêm một kết nối từ PgBouncer)
#     with Session(engine, expire_on_commit=False) as session:
#         yield session


# async def get_current_user(   # async: chỉ giải mã JWT (CPU nhẹ), khỏi tốn một lượt threadpool
#     credentials: HTTPAuthorizationCredentials = Depends(security),
# ) -> Dict[str, Any]:
#     token = credentials.credentials
#     try:
#         payload = jwt.decode(
#             token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
#         )
#         user_id: str = payload.get("sub")
#         role: str = payload.get("role")

#         if user_id is None:
#             raise HTTPException(
#                 status_code=status.HTTP_401_UNAUTHORIZED,
#                 detail="Token không chứa thông tin người dùng hợp lệ",
#             )
#         return {"user_id": user_id, "role": role}

#     except jwt.ExpiredSignatureError:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Phiên đăng nhập đã hết hạn",
#         )
#     except jwt.PyJWTError:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Token xác thực không hợp lệ",
#         )




# _______________________________________________________________

import os
import redis
from typing import Generator, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from sqlmodel import Session

from app.core.database import engine
from app.core.config import settings

security = HTTPBearer()

# Tự động lấy host từ biến môi trường, mặc định fallback về localhost
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Khai báo kết nối Redis với Timeout ngắn (1 giây) để không làm ngâm request
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=0,
    decode_responses=True,
    socket_connect_timeout=1,
    socket_timeout=1
)

def get_redis() -> redis.Redis:
    return redis_client


def get_db() -> Generator[Session, None, None]:
    with Session(engine, expire_on_commit=False) as session:
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Dict[str, Any]:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        role: str = payload.get("role")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token không chứa thông tin người dùng hợp lệ",
            )
        return {"user_id": user_id, "role": role}

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã hết hạn",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token xác thực không hợp lệ",
        )