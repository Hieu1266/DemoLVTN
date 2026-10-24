
"""
API Gateway - FastAPI reverse proxy + WLC + Priority + Waitlist
-----------------------------------------------------------------
Nhận request -> tính priority (user + api) -> xếp hàng nếu service đang
đầy (waitlist) -> chọn instance bằng Weighted Least Connections (WLC) ->
forward request -> trả kết quả về client.

Chạy: uvicorn gateway_main:app --host 0.0.0.0 --port 8088 --reload
Cần cài: pip install fastapi httpx uvicorn pyjwt python-dotenv
"""

import asyncio
import heapq
import itertools
import os
import re
import time
from dataclasses import dataclass, field

import jwt
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
JWT_SECRET = os.getenv("SECRET_KEY", "your_super_secret_key")
JWT_ALG = os.getenv("ALGORITHM", "HS256")

PUBLIC_PREFIXES = ("/api/v1/users/login", "/api/v1/users/register", "/health", "/docs", "/openapi.json")


def extract_role(request: Request) -> str | None:
    """Trả về role_name nếu token hợp lệ, None nếu thiếu/sai/hết hạn."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("role_name") or payload.get("role")
    except jwt.InvalidTokenError:
        return None


app = FastAPI(title="API Gateway - WLC + Priority + Waitlist")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 1. CẤU HÌNH INSTANCE + WEIGHT
# Đồng bộ chuẩn các nhóm service: "exam", "auth", "user"
# ============================================================
SERVICE_INSTANCES = {
    "exam": [
        {"url": "http://localhost:8001", "weight": 1.0, "active_connections": 0},
        {"url": "http://localhost:8011", "weight": 1.87, "active_connections": 0},
        {"url": "http://localhost:8021", "weight": 1.87, "active_connections": 0},
        {"url": "http://localhost:8031", "weight": 1.87, "active_connections": 0},
    ],
    "auth": [
        {"url": "http://localhost:8000", "weight": 1.0, "active_connections": 0},
        {"url": "http://localhost:8010", "weight": 1.25, "active_connections": 0},
    ],
    "user": [
        {"url": "http://localhost:8000", "weight": 1.0, "active_connections": 0},
    ],
}

# Bảng route: Mapping prefix path -> Đúng tên nhóm service ở trên
SERVICE_ROUTES = {
    "/api/v1/auth": "auth",
    "/api/v1/users": "user",
    "/api/v1/question": "exam",
    "/api/v1/questions": "exam",
    "/api/v1/exam": "exam",
    "/api/v1/exams": "exam",
    "/api/v1/attempts": "exam",
}

# ============================================================
# 2. CẤU HÌNH ADMISSION CONTROL (Waitlist)
# ============================================================
MAX_CONCURRENT = {
    "exam": 40,   # Thi - ngân sách connection DB lớn nhất
    "auth": 15,
    "user": 10,
}
WAITLIST_TIMEOUT = 15.0  # Giây - quá thời gian thì trả 503

# ============================================================
# 3. CẤU HÌNH PRIORITY (Dùng Regex thay vì startswith)
# ============================================================
USER_PRIORITY = {
    "admin": 1,
    "instructor": 2,
    "student": 3,
}
DEFAULT_USER_PRIORITY = 3

# Pattern Regex để bắt các URL động có chứa ID
API_PRIORITY_PATTERNS = [
    (re.compile(r"^/api/v1/exams/.*?/submit$"), 1),   # Nộp bài thi - Ưu tiên cao nhất
    (re.compile(r"^/api/v1/exams/.*?/start$"), 2),    # Vào/bắt đầu thi
    (re.compile(r"^/api/v1/exams/verify-access-code$"), 2),
    (re.compile(r"^/api/v1/auth/login$"), 3),
    (re.compile(r"^/api/v1/attempts/.*?/review$"), 4),
]
DEFAULT_API_PRIORITY = 4

USER_WEIGHT = 0.3
API_WEIGHT = 0.7


def compute_priority(path: str, role: str) -> float:
    user_p = USER_PRIORITY.get(role.lower(), DEFAULT_USER_PRIORITY)
    api_p = DEFAULT_API_PRIORITY
    
    for pattern, p in API_PRIORITY_PATTERNS:
        if pattern.match(path):
            api_p = p
            break
            
    return round(user_p * USER_WEIGHT + api_p * API_WEIGHT, 2)


# ============================================================
# 4. HÀNG ĐỢI ƯU TIÊN (Waitlist)
# ============================================================
@dataclass(order=True)
class _WaitItem:
    priority: float
    seq: int
    event: asyncio.Event = field(compare=False)


class PriorityWaitlist:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.in_use = 0
        self._heap: list[_WaitItem] = []
        self._counter = itertools.count()
        self._lock = asyncio.Lock()

    async def acquire(self, priority: float, timeout: float) -> bool:
        async with self._lock:
            if self.in_use < self.capacity:
                self.in_use += 1
                return True
            item = _WaitItem(priority=priority, seq=next(self._counter), event=asyncio.Event())
            heapq.heappush(self._heap, item)

        try:
            await asyncio.wait_for(item.event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            async with self._lock:
                if item in self._heap:
                    self._heap.remove(item)
                    heapq.heapify(self._heap)
            return False

    async def release(self):
        async with self._lock:
            if self._heap:
                next_item = heapq.heappop(self._heap)
                next_item.event.set()
            else:
                self.in_use -= 1


waitlists: dict[str, PriorityWaitlist] = {
    name: PriorityWaitlist(capacity) for name, capacity in MAX_CONCURRENT.items()
}

# ============================================================
# 5. WEIGHTED LEAST CONNECTIONS (WLC)
# ============================================================
wlc_lock = asyncio.Lock()


async def pick_instance_wlc(service_name: str) -> dict:
    instances = SERVICE_INSTANCES[service_name]
    async with wlc_lock:
        best = min(instances, key=lambda i: i["active_connections"] / i["weight"])
        best["active_connections"] += 1
    return best


async def release_instance(instance: dict):
    async with wlc_lock:
        instance["active_connections"] -= 1


# ============================================================
# 6. PROXY CORE & LIFECYCLE
# ============================================================
client: httpx.AsyncClient | None = None


@app.on_event("startup")
async def startup():
    global client
    client = httpx.AsyncClient(timeout=30.0)


@app.on_event("shutdown")
async def shutdown():
    if client:
        await client.aclose()


def resolve_service_name(path: str) -> str | None:
    matches = [prefix for prefix in SERVICE_ROUTES if path.startswith(prefix)]
    if not matches:
        return None
    best_prefix = max(matches, key=len)
    return SERVICE_ROUTES[best_prefix]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/debug/state")
async def debug_state():
    return {
        "instances": SERVICE_INSTANCES,
        "waitlists": {
            name: {"in_use": w.in_use, "waiting": len(w._heap), "capacity": w.capacity}
            for name, w in waitlists.items()
        },
    }


@app.api_route(
    "/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def proxy(full_path: str, request: Request):
    path = f"/{full_path}"
    
    # 1. Bỏ qua preflight OPTIONS request cho CORS
    if request.method == "OPTIONS":
        return Response(status_code=200)

    # 2. Match Service
    service_name = resolve_service_name(path)
    if service_name is None:
        return Response(
            content=f'{{"detail": "Khong co service nao xu ly path {path}"}}',
            status_code=404,
            media_type="application/json",
        )

    # 3. Authenticate JWT (Trừ public paths)
    is_public = any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)
    role = extract_role(request)

    if not is_public and role is None:
        return Response(
            content='{"detail": "Token khong hop le hoac da het han"}',
            status_code=401,
            media_type="application/json",
        )

    # 4. Tính toán Priority & Chờ slot ở Waitlist
    priority = compute_priority(path, role or "anonymous")
    waitlist = waitlists[service_name]
    started_waiting = time.monotonic()
    
    admitted = await waitlist.acquire(priority, timeout=WAITLIST_TIMEOUT)

    if not admitted:
        return Response(
            content='{"detail": "He thong dang qua tai, vui long thu lai sau"}',
            status_code=503,
            media_type="application/json",
            headers={"Retry-After": "5"},
        )
        
    wait_time = time.monotonic() - started_waiting

    instance = None
    try:
        # 5. Chọn instance WLC & Forward Request
        instance = await pick_instance_wlc(service_name)
        target_url = f"{instance['url']}{path}"

        body = await request.body()
        headers = dict(request.headers)
        headers.pop("host", None)

        upstream_response = await client.request(
            method=request.method,
            url=target_url,
            params=request.query_params,
            headers=headers,
            content=body,
        )

        resp_headers = {
            k: v
            for k, v in upstream_response.headers.items()
            if k.lower() not in ("content-encoding", "transfer-encoding", "content-length")
        }
        resp_headers["x-gateway-priority"] = str(priority)
        resp_headers["x-gateway-wait-seconds"] = str(round(wait_time, 3))
        resp_headers["x-gateway-instance"] = instance["url"]

        return Response(
            content=upstream_response.content,
            status_code=upstream_response.status_code,
            headers=resp_headers,
            media_type=upstream_response.headers.get("content-type"),
        )
    finally:
        if instance is not None:
            await release_instance(instance)
        await waitlist.release()

        