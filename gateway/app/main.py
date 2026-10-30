"""
API Gateway - FastAPI Reverse Proxy + Load Shedding + Cân bằng tải theo từng request
-----------------------------------------------------------------------------------
Chế độ cân bằng tải chọn bằng biến môi trường LB_MODE (đổi không cần build lại image):

  k8s    (mặc định) Gọi thẳng Service ClusterIP, kube-proxy chọn pod theo từng KẾT NỐI.
                    Kết nối keep-alive đã mở thì dính vào pod cũ -> pod mới do HPA tạo ít nhận tải.
  rr     Round-robin theo từng request, trên danh sách pod lấy từ Service headless.
  least  Ít request đang xử lý nhất (có khởi động chậm cho pod mới).
  p2c    "Power of two choices": bốc ngẫu nhiên 2 pod, chọn pod ít bận hơn.

Biến môi trường khác:
  EXAM_DISCOVERY_HOST / AUTH_DISCOVERY_HOST  tên Service headless (mặc định exam-service-headless ...)
  DISCOVERY_INTERVAL   chu kỳ làm mới danh sách pod, giây (mặc định 2)
  SLOW_START_SEC       thời gian tăng dần tải cho pod mới, giây (mặc định 10)
  UPSTREAM_TIMEOUT     timeout gọi backend, giây (mặc định 10)
  KEEPALIVE_EXPIRY     thời gian giữ kết nối rảnh, giây (mặc định 3, nhỏ hơn 5s của uvicorn)
  DISABLE_KEEPALIVE=1  tắt keep-alive tới backend (thí nghiệm ở chế độ k8s)

Mỗi phản hồi có thêm header: x-gateway-instance (ip:port pod đã phục vụ), x-gateway-pod, x-lb-mode.
GET /debug/state cho xem danh sách pod, số request đang xử lý và số đã phục vụ.
"""

import asyncio
import os
import random
import re
import socket
import time

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
JWT_SECRET = os.getenv("SECRET_KEY", "your_super_secret_key")
JWT_ALG = os.getenv("ALGORITHM", "HS256")

LB_MODE = os.getenv("LB_MODE", "k8s").lower()
if LB_MODE not in ("k8s", "rr", "least", "p2c"):
    LB_MODE = "k8s"
DISCOVERY_INTERVAL = float(os.getenv("DISCOVERY_INTERVAL", "2"))
SLOW_START_SEC = float(os.getenv("SLOW_START_SEC", "10"))
UPSTREAM_TIMEOUT = float(os.getenv("UPSTREAM_TIMEOUT", "10"))
KEEPALIVE_EXPIRY = float(os.getenv("KEEPALIVE_EXPIRY", "3"))
DISABLE_KEEPALIVE = os.getenv("DISABLE_KEEPALIVE", "0") == "1"
GATEWAY_POD = os.getenv("HOSTNAME", "gateway")

PUBLIC_PREFIXES = (
    "/api/v1/users/login",
    "/api/v1/users/register",
    "/health",
    "/docs",
    "/openapi.json",
)

HOP_BY_HOP = {
    "host", "connection", "content-length", "transfer-encoding", "keep-alive",
    "upgrade", "proxy-authenticate", "proxy-authorization", "te", "trailers",
}

app = FastAPI(title="API Gateway - K8s Fail-Fast")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 1. DANH SÁCH BACKEND VÀ CÂN BẰNG TẢI
# ============================================================
class Instance:
    """Một pod backend."""

    __slots__ = ("url", "active", "served", "born")

    def __init__(self, url: str, born: float | None = None):
        self.url = url
        self.active = 0       # số request đang xử lý
        self.served = 0       # số request đã phục vụ thành công
        # born=None: pod đã có từ trước, không cần khởi động chậm
        self.born = born

    @property
    def label(self) -> str:
        return self.url.split("//", 1)[1]

    def weight(self) -> float:
        """Khởi động chậm: trọng số tăng dần từ 0.2 lên 1.0 trong SLOW_START_SEC giây."""
        if self.born is None or SLOW_START_SEC <= 0:
            return 1.0
        age = time.monotonic() - self.born
        if age >= SLOW_START_SEC:
            return 1.0
        return 0.2 + 0.8 * (age / SLOW_START_SEC)

    def score(self) -> float:
        """Càng thấp càng nên được chọn. +1 để pod mới (active=0) không hút hết tải cùng lúc."""
        return (self.active + 1) / self.weight()


class Pool:
    """Nhóm pod của một service."""

    def __init__(self, name: str, cluster_url: str, discovery_host: str, port: int, max_concurrent: int):
        self.name = name
        self.discovery_host = discovery_host
        self.port = port
        self.max_concurrent = max_concurrent
        self.fallback = Instance(cluster_url)       # Service ClusterIP (kube-proxy tự chọn pod)
        self.instances: dict[str, Instance] = {}    # pod trực tiếp (chế độ rr / least / p2c)
        self._rr = 0
        self._discovered_once = False

    def active_total(self) -> int:
        return self.fallback.active + sum(i.active for i in self.instances.values())

    def pick(self, exclude: Instance | None = None) -> Instance:
        if LB_MODE == "k8s" or not self.instances:
            return self.fallback
        candidates = [i for i in self.instances.values() if i is not exclude]
        if not candidates:
            candidates = list(self.instances.values())
        if len(candidates) == 1:
            return candidates[0]

        if LB_MODE == "rr":
            ordered = sorted(candidates, key=lambda i: i.url)
            self._rr = (self._rr + 1) % len(ordered)
            return ordered[self._rr]
        if LB_MODE == "least":
            return min(candidates, key=lambda i: i.score())
        # p2c
        a, b = random.sample(candidates, 2)
        return a if a.score() <= b.score() else b

    async def refresh(self) -> None:
        """Lấy danh sách IP pod từ DNS của Service headless (chỉ gồm pod đã sẵn sàng)."""
        loop = asyncio.get_running_loop()
        infos = await loop.getaddrinfo(
            self.discovery_host, self.port, family=socket.AF_INET, type=socket.SOCK_STREAM
        )
        ips = {info[4][0] for info in infos}
        if not ips:
            return
        first = not self._discovered_once
        for ip in ips:
            url = f"http://{ip}:{self.port}"
            if url not in self.instances:
                # Lần dò đầu tiên: pod có sẵn nên không cần khởi động chậm
                self.instances[url] = Instance(url, born=None if first else time.monotonic())
        for url in list(self.instances):
            if url.split("//", 1)[1].rsplit(":", 1)[0] not in ips:
                del self.instances[url]    # pod đã biến mất; request đang chạy vẫn giữ tham chiếu
        self._discovered_once = True

    def snapshot(self) -> dict:
        return {
            "max_concurrent": self.max_concurrent,
            "active_total": self.active_total(),
            "clusterip": {"url": self.fallback.url, "active": self.fallback.active, "served": self.fallback.served},
            "instances": [
                {
                    "url": i.url,
                    "active": i.active,
                    "served": i.served,
                    "weight": round(i.weight(), 2),
                }
                for i in sorted(self.instances.values(), key=lambda x: x.url)
            ],
        }


POOLS = {
    "exam": Pool(
        "exam", "http://exam-service:8001",
        os.getenv("EXAM_DISCOVERY_HOST", "exam-service-headless"), 8001, 200,
    ),
    "auth": Pool(
        "auth", "http://auth-service:8000",
        os.getenv("AUTH_DISCOVERY_HOST", "auth-service-headless"), 8000, 100,
    ),
}

SERVICE_ROUTES = {
    "/api/v1/auth": "auth",
    "/api/v1/users": "auth",
    "/api/v1/question": "exam",
    "/api/v1/questions": "exam",
    "/api/v1/exam": "exam",
    "/api/v1/exams": "exam",
    "/api/v1/attempts": "exam",
}

# Phân cấp độ ưu tiên API (đường dẫn khớp với endpoint thật của exam-service / auth-service)
API_TIERS = [
    (re.compile(r"^/api/v1/attempts/[^/]+/submit$"), 1),  # Tier 1: Nộp bài (không được xả)
    (re.compile(r"^/api/v1/attempts/join$"), 1),          # Tier 1: Join phòng thi
    (re.compile(r"^/api/v1/attempts/[^/]+/draft$"), 2),   # Tier 2: Lưu nháp
    (re.compile(r"^/api/v1/users/login$"), 2),            # Tier 2: Đăng nhập
    (re.compile(r"^/api/v1/auth/login$"), 2),
]


def get_api_tier(path: str) -> int:
    for pattern, tier in API_TIERS:
        if pattern.match(path):
            return tier
    return 3


def extract_role(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("role_name") or payload.get("role")
    except jwt.InvalidTokenError:
        return None


# ============================================================
# 2. LOAD SHEDDING (FAIL FAST - KHÔNG NGÂM QUEUE)
# ============================================================
def should_drop_request(pool: Pool, tier: int) -> bool:
    # Nếu đang chạm ngưỡng tối đa -> chỉ cho Tier 1 (nộp bài / join) đi qua
    if pool.active_total() >= pool.max_concurrent:
        return tier > 1
    return False


# ============================================================
# 3. HTTP CLIENT POOL VÀ DÒ DANH SÁCH POD
# ============================================================
client: httpx.AsyncClient | None = None
_tasks: list = []


async def discovery_loop(pool: Pool) -> None:
    while True:
        try:
            await pool.refresh()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # DNS lỗi: giữ danh sách cũ
            print(f"[discovery] {pool.name}: {exc}")
        await asyncio.sleep(DISCOVERY_INTERVAL)


@app.on_event("startup")
async def startup():
    global client
    max_keepalive = 0 if DISABLE_KEEPALIVE else 300
    limits = httpx.Limits(
        max_keepalive_connections=max_keepalive,
        max_connections=1500,
        keepalive_expiry=KEEPALIVE_EXPIRY,
    )
    client = httpx.AsyncClient(
        limits=limits,
        timeout=httpx.Timeout(UPSTREAM_TIMEOUT, connect=3.0),
    )
    if LB_MODE != "k8s":
        for pool in POOLS.values():
            try:
                await pool.refresh()
            except Exception as exc:
                print(f"[discovery] {pool.name} (lần đầu): {exc}")
            _tasks.append(asyncio.create_task(discovery_loop(pool)))
    print(f"[gateway] LB_MODE={LB_MODE} pod={GATEWAY_POD}")


@app.on_event("shutdown")
async def shutdown():
    for t in _tasks:
        t.cancel()
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
        "mode": LB_MODE,
        "gateway_pod": GATEWAY_POD,
        "pools": {name: pool.snapshot() for name, pool in POOLS.items()},
    }


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(full_path: str, request: Request):
    path = f"/{full_path}"

    if request.method == "OPTIONS":
        return Response(status_code=200)

    service_name = resolve_service_name(path)
    if service_name is None:
        return Response(content='{"detail": "Not Found"}', status_code=404, media_type="application/json")

    is_public = any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)
    role = extract_role(request)

    if not is_public and role is None:
        return Response(
            content='{"detail": "Token khong hop le hoac da het han"}',
            status_code=401,
            media_type="application/json",
        )

    pool = POOLS[service_name]
    tier = get_api_tier(path)

    # BẢO VỆ HỆ THỐNG: quá tải thì từ chối ngay (503)
    if should_drop_request(pool, tier):
        return Response(
            content='{"detail": "He thong dang qua tai, vui long thu lai sau"}',
            status_code=503,
            headers={"Retry-After": "2", "x-gateway-pod": GATEWAY_POD},
            media_type="application/json",
        )

    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}

    inst = pool.pick()
    inst.active += 1
    try:
        for attempt in (0, 1):
            try:
                upstream_response = await client.request(
                    method=request.method,
                    url=f"{inst.url}{path}",
                    params=request.query_params,
                    headers=headers,
                    content=body,
                )
                break
            except (httpx.ConnectError, httpx.ConnectTimeout):
                # Chưa gửi được request tới pod này -> thử lại một lần với pod khác (an toàn với mọi method)
                if attempt == 0 and LB_MODE != "k8s":
                    inst.active = max(0, inst.active - 1)
                    inst = pool.pick(exclude=inst)
                    inst.active += 1
                    continue
                raise

        inst.served += 1
        resp_headers = {
            k: v for k, v in upstream_response.headers.items()
            if k.lower() not in ("content-encoding", "transfer-encoding", "content-length")
        }
        resp_headers["x-gateway-instance"] = inst.label
        resp_headers["x-gateway-pod"] = GATEWAY_POD
        resp_headers["x-lb-mode"] = LB_MODE

        return Response(
            content=upstream_response.content,
            status_code=upstream_response.status_code,
            headers=resp_headers,
            media_type=upstream_response.headers.get("content-type"),
        )
    except httpx.RequestError:
        return Response(
            content='{"detail": "Service Unavailable"}',
            status_code=503,
            headers={"x-gateway-pod": GATEWAY_POD, "x-gateway-instance": inst.label},
            media_type="application/json",
        )
    finally:
        inst.active = max(0, inst.active - 1)