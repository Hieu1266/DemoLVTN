import asyncio
import heapq
import os
import random
import re
import socket
import time

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask

load_dotenv()
JWT_SECRET = os.getenv("SECRET_KEY", "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")
JWT_ALG = os.getenv("ALGORITHM", "HS256")

LB_MODE = os.getenv("LB_MODE", "k8s").lower()
if LB_MODE not in ("k8s", "rr", "least", "p2c"):
    LB_MODE = "k8s"
DISCOVERY_INTERVAL = float(os.getenv("DISCOVERY_INTERVAL", "2"))
SLOW_START_SEC = float(os.getenv("SLOW_START_SEC", "10"))
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

# ============================================================
# CẤU HÌNH TIMEOUT & HÀNG ĐỢI ĐỘNG (TỐI ƯU MỚI)
# ============================================================
# Timeout chờ upstream xử lý tùy theo độ ưu tiên
TIER_TIMEOUTS = {
    1: 60.0,  # Tier 1 (Nộp bài, Join): Cho phép chạy tối đa 60 giây
    2: 20.0,  # Tier 2 (Draft, Login): 20 giây
    3: 10.0,  # Tier 3 (Khác): 10 giây
}

# Thời gian tối đa được phép chờ trong Hàng đợi trước khi bị loại bỏ (Load Shedding)
QUEUE_TIMEOUTS = {
    1: 15.0,  # Tier 1 kiên nhẫn chờ slot trống tới 15 giây
    2: 5.0,   # Tier 2 chờ 5 giây
    3: 2.0,   # Tier 3 chờ 2 giây
}


app = FastAPI(title="API Gateway - K8s Priority Queue & Streaming")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 1. BỘ GIỚI HẠN & HÀNG ĐỢI ƯU TIÊN (PRIORITY LIMITER)
# ============================================================
class PriorityLimiter:
    """Quản lý giới hạn đồng thời và xếp hàng các request vượt ngưỡng."""
    def __init__(self, max_concurrent: int, max_queue: int = 300):
        self.max_concurrent = max_concurrent
        self.max_queue = max_queue
        self.active = 0
        self.queue = []      # Min-Heap lưu tuple: (priority, counter, event)
        self._counter = 0    # Đảm bảo FIFO cho các request cùng mức priority

    async def acquire(self, priority: int, timeout: float) -> bool:
        if self.active < self.max_concurrent:
            self.active += 1
            return True
        
        # Hàng đợi đã đầy -> Từ chối (Load Shedding bảo vệ bộ nhớ Gateway)
        if len(self.queue) >= self.max_queue:
            return False
            
        self._counter += 1
        event = asyncio.Event()
        # priority nhỏ hơn sẽ nổi lên đầu (1 ưu tiên hơn 2)
        heapq.heappush(self.queue, (priority, self._counter, event))
        
        try:
            # Chờ tới lượt được cấp phát
            await asyncio.wait_for(event.wait(), timeout=timeout)
            # Worker release đã tăng self.active cho ta rồi, nên không cần tăng thêm
            return True
        except asyncio.TimeoutError:
            # Hết thời gian kiên nhẫn chờ trong hàng đợi -> Đánh dấu bỏ qua
            event.set() 
            return False

    def release(self):
        self.active -= 1
        # Cấp phát slot cho request đứng đầu hàng đợi
        while self.queue:
            _, _, event = heapq.heappop(self.queue)
            # Bỏ qua những request đã bị timeout (is_set == True do TimeoutError ở trên)
            if not event.is_set():
                self.active += 1
                event.set() # Đánh thức request
                break


class Instance:
    __slots__ = ("url", "active", "served", "born")

    def __init__(self, url: str, born: float | None = None):
        self.url = url
        self.active = 0
        self.served = 0
        self.born = born

    @property
    def label(self) -> str:
        return self.url.split("//", 1)[1]

    def weight(self) -> float:
        if self.born is None or SLOW_START_SEC <= 0:
            return 1.0
        age = time.monotonic() - self.born
        if age >= SLOW_START_SEC:
            return 1.0
        return 0.2 + 0.8 * (age / SLOW_START_SEC)

    def score(self) -> float:
        return (self.active + 1) / self.weight()


class Pool:
    def __init__(self, name: str, cluster_url: str, discovery_host: str, port: int, max_concurrent: int):
        self.name = name
        self.discovery_host = discovery_host
        self.port = port
        self.fallback = Instance(cluster_url)
        self.instances: dict[str, Instance] = {}
        self._rr = 0
        self._discovered_once = False
        
        # Tích hợp bộ Limiter với hàng đợi 300 slot cho mỗi pool
        self.limiter = PriorityLimiter(max_concurrent, max_queue=300)

    def active_total(self) -> int:
        return self.limiter.active

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
        
        a, b = random.sample(candidates, 2)
        return a if a.score() <= b.score() else b

    async def refresh(self) -> None:
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
                self.instances[url] = Instance(url, born=None if first else time.monotonic())
        for url in list(self.instances):
            if url.split("//", 1)[1].rsplit(":", 1)[0] not in ips:
                del self.instances[url]
        self._discovered_once = True

    def snapshot(self) -> dict:
        return {
            "max_concurrent": self.limiter.max_concurrent,
            "active_total": self.limiter.active,
            "queue_size": len(self.limiter.queue),
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
    "exam": Pool("exam", "http://exam-service:8001", os.getenv("EXAM_DISCOVERY_HOST", "exam-service-headless"), 8001, 200),
    "auth": Pool("auth", "http://auth-service:8000", os.getenv("AUTH_DISCOVERY_HOST", "auth-service-headless"), 8000, 100),
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

API_TIERS = [
    (re.compile(r"^/api/v1/attempts/[^/]+/submit$"), 1),
    (re.compile(r"^/api/v1/attempts/join$"), 1),
    (re.compile(r"^/api/v1/attempts/[^/]+/draft$"), 2),
    (re.compile(r"^/api/v1/users/login$"), 2),
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


client: httpx.AsyncClient | None = None
_tasks: list = []


async def discovery_loop(pool: Pool) -> None:
    while True:
        try:
            await pool.refresh()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
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
    client = httpx.AsyncClient(limits=limits)
    
    if LB_MODE != "k8s":
        for pool in POOLS.values():
            try:
                await pool.refresh()
            except Exception as exc:
                print(f"[discovery] {pool.name} (lần đầu): {exc}")
            _tasks.append(asyncio.create_task(discovery_loop(pool)))


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
            content='{"detail": "Token không hợp lệ hoặc đã hết hạn"}',
            status_code=401,
            media_type="application/json",
        )

    pool = POOLS[service_name]
    tier = get_api_tier(path)

    # 1. Đưa vào hàng đợi ưu tiên thay vì từ chối thẳng
    queue_timeout = QUEUE_TIMEOUTS.get(tier, 2.0)
    acquired = await pool.limiter.acquire(priority=tier, timeout=queue_timeout)
    
    if not acquired:
        # Hàng đợi chật hoặc đợi quá lâu -> Load Shedding
        return Response(
            content='{"detail": "Hệ thống đang quá tải, vui lòng thử lại sau"}',
            status_code=503,
            headers={"Retry-After": "5", "x-gateway-pod": GATEWAY_POD},
            media_type="application/json",
        )

    # Đã có slot xử lý -> Tính toán Timeout linh hoạt theo Tier
    upstream_timeout = TIER_TIMEOUTS.get(tier, 10.0)
    req_timeout = httpx.Timeout(upstream_timeout, connect=3.0)

    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}

    inst = pool.pick()
    inst.active += 1
    
    upstream_response = None
    try:
        for attempt in (0, 1):
            try:
                # Build request thủ công để dùng với client.send()
                req_obj = client.build_request(
                    method=request.method,
                    url=f"{inst.url}{path}",
                    params=request.query_params,
                    headers=headers,
                    content=body,
                    timeout=req_timeout
                )
                # 2. Bật stream=True để nhận kết quả dạng luồng thay vì chờ toàn bộ
                upstream_response = await client.send(req_obj, stream=True)
                break
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if attempt == 0 and LB_MODE != "k8s":
                    inst.active = max(0, inst.active - 1)
                    inst = pool.pick(exclude=inst)
                    inst.active += 1
                    continue
                raise
    except Exception:
        inst.active = max(0, inst.active - 1)
        pool.limiter.release()
        return Response(
            content='{"detail": "Service Unavailable hoặc Timeout xử lý từ hệ thống"}',
            status_code=503,
            headers={"x-gateway-pod": GATEWAY_POD},
            media_type="application/json",
        )

    # Nếu thành công
    inst.served += 1
    resp_headers = {
        k: v for k, v in upstream_response.headers.items()
        if k.lower() not in ("content-encoding", "transfer-encoding", "content-length")
    }
    resp_headers["x-gateway-instance"] = inst.label
    resp_headers["x-gateway-pod"] = GATEWAY_POD
    resp_headers["x-lb-mode"] = LB_MODE

    # 3. Hàm chạy ngầm giải phóng tài nguyên sau khi stream kết thúc
    async def cleanup():
        try:
            await upstream_response.aclose()
        finally:
            inst.active = max(0, inst.active - 1)
            pool.limiter.release()

    # Trả về dạng StreamingResponse để không chặn request của client
    return StreamingResponse(
        upstream_response.aiter_raw(), # Đẩy các khối byte về client ngay lập tức
        status_code=upstream_response.status_code,
        headers=resp_headers,
        background=BackgroundTask(cleanup), # Giải phóng queue an toàn trong background
        media_type=upstream_response.headers.get("content-type")
    )