import asyncio
import heapq
import os
import random
import re
import socket
import time
from contextlib import asynccontextmanager

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
JWT_SECRET = os.getenv("SECRET_KEY")
if not JWT_SECRET:
    raise RuntimeError("Thiếu biến môi trường SECRET_KEY")
JWT_ALG = os.getenv("ALGORITHM", "HS256")

LB_MODE = os.getenv("LB_MODE", "k8s").lower()
if LB_MODE not in ("k8s", "rr", "least", "p2c"):
    LB_MODE = "k8s"
DISCOVERY_INTERVAL = float(os.getenv("DISCOVERY_INTERVAL", "2"))
SLOW_START_SEC = float(os.getenv("SLOW_START_SEC", "10"))
KEEPALIVE_EXPIRY = float(os.getenv("KEEPALIVE_EXPIRY", "3"))
DISABLE_KEEPALIVE = os.getenv("DISABLE_KEEPALIVE", "0") == "1"
GATEWAY_POD = os.getenv("HOSTNAME", "gateway")

# Giới hạn đồng thời THEO SỐ POD (đo từ viên gạch: exam pod 500m ~28 req/s, vỡ khi quá ~40 request đồng thời).
# Tổng in-flight tới 1 pod = per_pod; mỗi gateway giữ per_pod * số_pod / số_gateway. 0 = tắt (dùng số cố định).
EXAM_PER_POD = int(os.getenv("EXAM_PER_POD_CONCURRENCY", "30"))
AUTH_PER_POD = int(os.getenv("AUTH_PER_POD_CONCURRENCY", "0"))
MIN_CONCURRENT = int(os.getenv("MIN_CONCURRENT", "4"))
GATEWAY_REPLICAS = max(1, int(os.getenv("GATEWAY_REPLICAS", "3")))     # dự phòng khi discovery gateway lỗi
GATEWAY_DISCOVERY_HOST = os.getenv("GATEWAY_DISCOVERY_HOST", "api-gateway-headless")
GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", "8088"))
gateway_count = GATEWAY_REPLICAS

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
STRIP_RESPONSE = {"content-encoding", "transfer-encoding", "content-length", "connection", "keep-alive"}

# ============================================================
# CẤU HÌNH THEO TIER
# ============================================================
# Tổng thời gian tối đa chờ upstream trả lời (wait_for, không phải timeout từng lần đọc)
TIER_TIMEOUTS = {1: 30.0, 2: 15.0, 3: 10.0}
# Thời gian tối đa chờ trong hàng đợi trước khi bị loại
QUEUE_TIMEOUTS = {1: 15.0, 2: 5.0, 3: 2.0}
# Tỉ lệ slot mỗi tier được dùng: tier thấp không được chiếm hết, luôn chừa chỗ cho Tier 1
TIER_SLOT_RATIO = {1: 1.0, 2: 0.9, 3: 0.75}
# Tỉ lệ hàng đợi mỗi tier được dùng
TIER_QUEUE_RATIO = {1: 1.0, 2: 0.7, 3: 0.3}
RETRY_AFTER = {1: "2", 2: "3", 3: "5"}


# ============================================================
# 1. LIMITER ƯU TIÊN (cancel-safe, không rò slot)
# ============================================================
class PriorityLimiter:
    def __init__(self, max_concurrent: int, max_queue: int = 300):
        self.max_concurrent = max_concurrent
        self.max_queue = max_queue
        self.active = 0
        self.waiting = 0                 # số request THỰC SỰ đang chờ (không tính entry đã chết)
        self._heap: list = []            # (tier, seq, future)
        self._seq = 0
        self.shed = {1: 0, 2: 0, 3: 0}   # thống kê số request bị loại theo tier

    def _limit(self, tier: int) -> int:
        return max(1, int(self.max_concurrent * TIER_SLOT_RATIO.get(tier, 0.75)))

    def _queue_limit(self, tier: int) -> int:
        return max(1, int(self.max_queue * TIER_QUEUE_RATIO.get(tier, 0.3)))

    def _dispatch(self) -> None:
        # Tier tốt nhất ở đầu heap; nếu nó chưa được phép chạy thì các tier thấp hơn cũng chưa
        while self._heap:
            tier, _, fut = self._heap[0]
            if fut.done():                       # đã timeout/cancel -> bỏ
                heapq.heappop(self._heap)
                continue
            if self.active >= self._limit(tier):
                break
            heapq.heappop(self._heap)
            self.active += 1
            fut.set_result(True)

    def _compact(self) -> None:
        if len(self._heap) > 4 * self.max_queue:
            self._heap = [e for e in self._heap if not e[2].done()]
            heapq.heapify(self._heap)

    async def acquire(self, tier: int, timeout: float) -> bool:
        if self.active < self._limit(tier):
            self.active += 1
            return True
        if self.waiting >= self._queue_limit(tier):
            self.shed[tier] += 1
            return False

        fut = asyncio.get_running_loop().create_future()
        self._seq += 1
        heapq.heappush(self._heap, (tier, self._seq, fut))
        self.waiting += 1
        try:
            await asyncio.wait_for(fut, timeout)
            return True
        except asyncio.TimeoutError:
            if fut.done() and not fut.cancelled():
                return True                      # được cấp slot sát giờ timeout
            self.shed[tier] += 1
            return False
        except asyncio.CancelledError:
            if fut.done() and not fut.cancelled():
                self.release()                   # đã được cấp slot nhưng client bỏ đi -> trả lại
            raise
        finally:
            self.waiting -= 1
            self._compact()

    def release(self) -> None:
        self.active = max(0, self.active - 1)
        self._dispatch()


# ============================================================
# 2. BACKEND VÀ CÂN BẰNG TẢI
# ============================================================
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
    def __init__(self, name: str, cluster_url: str, discovery_host: str, port: int,
                 max_concurrent: int, max_queue: int = 300, per_pod: int = 0):
        self.name = name
        self.per_pod = per_pod
        self.base_concurrent = max_concurrent
        self.discovery_host = discovery_host
        self.port = port
        self.fallback = Instance(cluster_url)
        self.instances: dict[str, Instance] = {}
        self.limiter = PriorityLimiter(max_concurrent, max_queue)
        self._rr = 0
        self._discovered_once = False

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

    def update_capacity(self) -> None:
        """Giới hạn đồng thời của gateway này = per_pod * số_pod / số_gateway (chỉ khi có discovery)."""
        if self.per_pod > 0 and LB_MODE != "k8s" and self.instances:
            cap = max(MIN_CONCURRENT, round(self.per_pod * len(self.instances) / max(1, gateway_count)))
        else:
            cap = self.base_concurrent
        if cap != self.limiter.max_concurrent:
            self.limiter.max_concurrent = cap
            self.limiter._dispatch()        # giới hạn tăng -> cho request đang chờ vào

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
        self.update_capacity()

    def snapshot(self) -> dict:
        lim = self.limiter
        return {
            "max_concurrent": lim.max_concurrent,
            "per_pod": self.per_pod,
            "active_total": lim.active,
            "queue_size": lim.waiting,
            "shed_by_tier": lim.shed,
            "clusterip": {"url": self.fallback.url, "active": self.fallback.active, "served": self.fallback.served},
            "instances": [
                {"url": i.url, "active": i.active, "served": i.served, "weight": round(i.weight(), 2)}
                for i in sorted(self.instances.values(), key=lambda x: x.url)
            ],
        }


POOLS = {
    "exam": Pool("exam", "http://exam-service:8001",
                 os.getenv("EXAM_DISCOVERY_HOST", "exam-service-headless"), 8001, 200,
                 per_pod=EXAM_PER_POD),
    "auth": Pool("auth", "http://auth-service:8000",
                 os.getenv("AUTH_DISCOVERY_HOST", "auth-service-headless"), 8000, 100,
                 per_pod=AUTH_PER_POD),
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


def resolve_service_name(path: str) -> str | None:
    matches = [p for p in SERVICE_ROUTES if path.startswith(p)]
    return SERVICE_ROUTES[max(matches, key=len)] if matches else None


def extract_role(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("role_name") or payload.get("role")
    except jwt.InvalidTokenError:
        return None


def json_error(detail: str, status: int, headers: dict | None = None) -> Response:
    h = {"x-gateway-pod": GATEWAY_POD}
    if headers:
        h.update(headers)
    return Response(content=f'{{"detail": "{detail}"}}', status_code=status,
                    headers=h, media_type="application/json")


# ============================================================
# 3. VÒNG ĐỜI ỨNG DỤNG
# ============================================================
client: httpx.AsyncClient | None = None


async def discovery_loop(pool: Pool) -> None:
    while True:
        try:
            await pool.refresh()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[discovery] {pool.name}: {exc}")
        await asyncio.sleep(DISCOVERY_INTERVAL)


async def gateway_count_loop() -> None:
    """Đếm số gateway pod Ready để chia đều giới hạn (HPA đổi số gateway -> giới hạn tự đổi theo)."""
    global gateway_count
    while True:
        try:
            infos = await asyncio.get_running_loop().getaddrinfo(
                GATEWAY_DISCOVERY_HOST, GATEWAY_PORT, family=socket.AF_INET, type=socket.SOCK_STREAM)
            n = len({info[4][0] for info in infos}) or GATEWAY_REPLICAS
        except asyncio.CancelledError:
            raise
        except Exception:
            n = GATEWAY_REPLICAS
        if n != gateway_count:
            gateway_count = n
            for pool in POOLS.values():
                pool.update_capacity()
        await asyncio.sleep(DISCOVERY_INTERVAL)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global client
    limits = httpx.Limits(
        max_keepalive_connections=0 if DISABLE_KEEPALIVE else 300,
        max_connections=1500,
        keepalive_expiry=KEEPALIVE_EXPIRY,
    )
    # Timeout thực tế được kiểm soát bằng asyncio.wait_for theo tier; ở đây chỉ chặn connect
    client = httpx.AsyncClient(limits=limits, timeout=httpx.Timeout(None, connect=3.0))
    tasks: list[asyncio.Task] = []
    if LB_MODE != "k8s":
        for pool in POOLS.values():
            try:
                await pool.refresh()
            except Exception as exc:
                print(f"[discovery] {pool.name} (lần đầu): {exc}")
            tasks.append(asyncio.create_task(discovery_loop(pool)))
        if any(p.per_pod > 0 for p in POOLS.values()):
            tasks.append(asyncio.create_task(gateway_count_loop()))
    print(f"[gateway] LB_MODE={LB_MODE} pod={GATEWAY_POD}")
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await client.aclose()


app = FastAPI(title="API Gateway - Priority Queue + Load Shedding", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/debug/state")
async def debug_state():
    return {
        "mode": LB_MODE,
        "gateway_pod": GATEWAY_POD,
        "gateway_count": gateway_count,
        "pools": {name: pool.snapshot() for name, pool in POOLS.items()},
    }


# ============================================================
# 4. PROXY
# ============================================================
async def forward(pool: Pool, request: Request, path: str, headers: dict,
                  body: bytes, timeout: float) -> tuple[httpx.Response, Instance]:
    """Gửi request tới pod. Chỉ retry khi LỖI KẾT NỐI (request chưa tới pod nên an toàn với mọi method)."""
    inst = pool.pick()
    for attempt in (0, 1):
        used = inst
        used.active += 1
        try:
            resp = await asyncio.wait_for(
                client.request(
                    method=request.method,
                    url=f"{used.url}{path}",
                    params=request.query_params,
                    headers=headers,
                    content=body,
                ),
                timeout=timeout,
            )
            used.served += 1
            return resp, used
        except (httpx.ConnectError, httpx.ConnectTimeout):
            if attempt == 0 and LB_MODE != "k8s":
                inst = pool.pick(exclude=used)
                continue
            raise
        finally:
            used.active -= 1
    raise RuntimeError("unreachable")


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(full_path: str, request: Request):
    path = f"/{full_path}"

    if request.method == "OPTIONS":
        return Response(status_code=200)

    service_name = resolve_service_name(path)
    if service_name is None:
        return json_error("Not Found", 404)

    if not any(path.startswith(p) for p in PUBLIC_PREFIXES) and extract_role(request) is None:
        return json_error("Token không hợp lệ hoặc đã hết hạn", 401)

    # Đọc body TRƯỚC khi giữ slot: client chậm/ngắt không chiếm chỗ của người khác
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}

    pool = POOLS[service_name]
    tier = get_api_tier(path)

    if not await pool.limiter.acquire(tier, QUEUE_TIMEOUTS[tier]):
        return json_error("Hệ thống đang quá tải, vui lòng thử lại sau", 503,
                          {"Retry-After": RETRY_AFTER[tier]})

    # Từ đây mọi đường thoát đều đi qua finally -> luôn trả slot
    try:
        try:
            resp, inst = await forward(pool, request, path, headers, body, TIER_TIMEOUTS[tier])
        except (asyncio.TimeoutError, httpx.TimeoutException):
            return json_error("Hệ thống xử lý quá lâu", 504)
        except httpx.RequestError:
            return json_error("Service Unavailable", 503)

        out_headers = {k: v for k, v in resp.headers.items() if k.lower() not in STRIP_RESPONSE}
        out_headers.update({
            "x-gateway-instance": inst.label,
            "x-gateway-pod": GATEWAY_POD,
            "x-lb-mode": LB_MODE,
        })
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=out_headers,
            media_type=resp.headers.get("content-type"),
        )
    finally:
        pool.limiter.release()