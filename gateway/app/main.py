"""
API Gateway v8 - v7 + các sửa cho điểm "gateway tính sai thì pod chết".

Lớp 1 (proxy):       route -> JWT -> giới hạn in-flight theo user -> tag tier (API x role)
Lớp 2 (FairLimiter): WFQ theo giây xử lý + admission (predict_wait) + AIMD

Thay đổi so với v7:
  1. Trần DB bật mặc định (EXAM/AUTH_DB_BUDGET) và có hiệu lực cả ở LB_MODE=k8s;
     thêm *_STATIC_PODS cho k8s mode; chia thêm theo WEB_CONCURRENCY (số worker uvicorn).
  2. AIMD: timeout/5xx -> giảm trần đồng thời (x0.85, tối đa 1 lần/giây); thành công -> tăng dần.
  3. CostModel học thời gian GIỮ SLOT đo ở gateway (bỏ x-process-time), chỉ từ 2xx/3xx,
     và học cả mẫu timeout (censored: chặn trên bởi TIER_TIMEOUTS, 1 mẫu/giây).
  4. predict_wait theo WFQ (phần chia đảm bảo của tier) thay vì giả định ưu tiên tuyệt đối.
  5. pressure = tuổi vé đầu hàng / queue_timeout (0..1); bản v7 gần như luôn ~0.
  6. Tag = API x role (JWT đã ký); giới hạn in-flight theo user; login (public) theo IP (tuỳ chọn).
  7. Regex tier chịu dấu "/" cuối; auth/login là public; /debug/state khoá bằng DEBUG_TOKEN; CORS cấu hình được.
"""
import asyncio
import json
import math
import os
import random
import re
import socket
import time
import hmac
from collections import deque
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

MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(2 * 1024 * 1024)))
BODY_READ_TIMEOUT = float(os.getenv("BODY_READ_TIMEOUT", "5.0"))

# --- Giới hạn đồng thời theo số pod (đo từ "viên gạch"), chia đều cho số gateway ---
EXAM_PER_POD = int(os.getenv("EXAM_PER_POD_CONCURRENCY", "30"))
AUTH_PER_POD = int(os.getenv("AUTH_PER_POD_CONCURRENCY", "0"))
# Trần theo DB: tổng số request đồng thời được phép đụng DB (PgBouncer/PostgreSQL), 0 = tắt.
EXAM_DB_BUDGET = int(os.getenv("EXAM_DB_BUDGET", "60"))
AUTH_DB_BUDGET = int(os.getenv("AUTH_DB_BUDGET", "30"))
MIN_CONCURRENT = int(os.getenv("MIN_CONCURRENT", "4"))
GATEWAY_REPLICAS = max(1, int(os.getenv("GATEWAY_REPLICAS", "3")))
GATEWAY_DISCOVERY_HOST = os.getenv("GATEWAY_DISCOVERY_HOST", "api-gateway-headless")
GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", "8088"))
gateway_count = GATEWAY_REPLICAS

PUBLIC_PREFIXES = (
    "/api/v1/users/login",
    "/api/v1/auth/login",
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
TIER_TIMEOUTS = {1: 30.0, 2: 15.0, 3: 10.0}      # chờ upstream trả lời
QUEUE_TIMEOUTS = {1: 15.0, 2: 5.0, 3: 2.0}       # chờ trong hàng đợi
TIER_SLOT_RATIO = {1: 1.0, 2: 0.9, 3: 0.75}      # tier thấp không được chiếm hết slot
TIER_QUEUE_RATIO = {1: 1.0, 2: 0.7, 3: 0.3}      # chặn trên số lượng (lưới an toàn)
RETRY_AFTER = {1: 2, 2: 3, 3: 5}

# Trọng số gốc x:y:z (tính theo GIÂY XỬ LÝ, không phải số request)
TIER_BASE_WEIGHT = {1: 5.0, 2: 3.0, 3: 2.0}
PRESSURE_ALPHA = float(os.getenv("PRESSURE_ALPHA", "1.0"))
PRESSURE_MAX = float(os.getenv("PRESSURE_MAX", "3.0"))
ADMIT_MARGIN = float(os.getenv("ADMIT_MARGIN", "1.0"))     # chờ dự đoán > timeout*margin -> loại ngay
DEFAULT_SERVICE_TIME_SEC = float(os.getenv("DEFAULT_SERVICE_TIME_SEC", "0.10"))
SERVICE_EWMA_ALPHA = float(os.getenv("SERVICE_EWMA_ALPHA", "0.20"))
MAX_ENDPOINT_KEYS = int(os.getenv("MAX_ENDPOINT_KEYS", "200"))

# --- v8 ---
WORKERS = max(1, int(os.getenv("WEB_CONCURRENCY", "1")))          # mỗi worker có limiter riêng
EXAM_STATIC_PODS = int(os.getenv("EXAM_STATIC_PODS", "0"))        # k8s mode: số pod exam (0 = không dùng)
AUTH_STATIC_PODS = int(os.getenv("AUTH_STATIC_PODS", "0"))
AIMD_ENABLED = os.getenv("AIMD_ENABLED", "1") == "1"
AIMD_DECREASE = float(os.getenv("AIMD_DECREASE", "0.85"))
AIMD_MIN_RATIO = float(os.getenv("AIMD_MIN_RATIO", "0.25"))
AIMD_COOLDOWN = float(os.getenv("AIMD_COOLDOWN", "1.0"))
CENSORED_COOLDOWN = float(os.getenv("CENSORED_COOLDOWN", "1.0"))
PER_USER_INFLIGHT = int(os.getenv("PER_USER_INFLIGHT", "6"))      # 0 = tắt
PUBLIC_IP_INFLIGHT = int(os.getenv("PUBLIC_IP_INFLIGHT", "0"))    # login/register theo IP, 0 = tắt
TRUST_XFF = os.getenv("TRUST_XFF", "0") == "1"
DEFAULT_TIER = min(3, max(1, int(os.getenv("DEFAULT_TIER", "3"))))
DEBUG_TOKEN = os.getenv("DEBUG_TOKEN", "")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
_DEFAULT_ROLE_BOOST = {"admin": 1, "manager": 1, "instructor": 1}   # nâng 1 bậc ưu tiên (tier-1, tối thiểu 1)
try:
    ROLE_TIER_BOOST = {str(k).lower(): int(v) for k, v in json.loads(os.getenv("ROLE_TIER_BOOST", "")).items()}
except (ValueError, TypeError, AttributeError):
    ROLE_TIER_BOOST = _DEFAULT_ROLE_BOOST


# ============================================================
# 1. MÔ HÌNH CHI PHÍ + LIMITER CÔNG BẰNG
# ============================================================
class CostModel:
    """EWMA thời gian GIỮ SLOT theo endpoint (đo ở gateway); chưa có thì dùng EWMA của tier."""

    def __init__(self):
        d = max(0.001, DEFAULT_SERVICE_TIME_SEC)
        self.by_tier = {1: d, 2: d, 3: d}
        self.by_endpoint: dict[str, float] = {}
        self._last_censored = 0.0

    def estimate(self, tier: int, endpoint: str) -> float:
        return self.by_endpoint.get(endpoint, self.by_tier[tier])

    def observe(self, tier: int, endpoint: str, secs: float, censored: bool = False) -> None:
        """censored=True: request bị timeout -> slot đã bị giữ >= secs. Học thưa (1 mẫu/giây)
        để một loạt timeout cùng lúc không đẩy EWMA lên trần ngay lập tức."""
        if secs <= 0:
            return
        if censored:
            now = time.monotonic()
            if now - self._last_censored < CENSORED_COOLDOWN:
                return
            self._last_censored = now
        s = min(TIER_TIMEOUTS[tier], max(0.001, secs))      # slot không bao giờ bị giữ quá timeout của tier
        a = min(1.0, max(0.01, SERVICE_EWMA_ALPHA))
        self.by_tier[tier] = (1 - a) * self.by_tier[tier] + a * s
        if endpoint in self.by_endpoint:
            self.by_endpoint[endpoint] = (1 - a) * self.by_endpoint[endpoint] + a * s
        elif len(self.by_endpoint) < MAX_ENDPOINT_KEYS:    # chặn phình bộ nhớ do path bị fuzz
            self.by_endpoint[endpoint] = s


class _Ticket:
    __slots__ = ("tier", "cost", "fut", "granted", "queued", "t")

    def __init__(self, tier: int, cost: float, fut: asyncio.Future):
        self.tier = tier
        self.cost = cost
        self.fut = fut
        self.granted = False
        self.queued = True
        self.t = time.monotonic()                    # lúc vào hàng (tính tuổi vé đầu hàng)


class Permit:
    __slots__ = ("tier", "cost")

    def __init__(self, tier: int, cost: float):
        self.tier = tier
        self.cost = cost


class FairLimiter:
    def __init__(self, max_concurrent: int, max_queue: int = 300):
        self.static_cap = max(1, max_concurrent)       # trần cấu hình (DB budget / per-pod)
        self._aimd = float(self.static_cap)            # trần đang áp dụng (AIMD, <= static_cap)
        self._last_decrease = 0.0
        self.aimd_cuts = 0
        self.max_queue = max_queue
        self.active = 0
        self.active_work = 0.0                       # tổng chi phí ước tính của request đang chạy
        self.active_by_tier = {1: 0, 2: 0, 3: 0}
        self.waiting = {1: 0, 2: 0, 3: 0}            # số vé còn sống trong hàng đợi
        self.queued_work = {1: 0.0, 2: 0.0, 3: 0.0}  # tổng chi phí ước tính của vé còn sống
        self._queues: dict[int, deque] = {1: deque(), 2: deque(), 3: deque()}
        self._vtime = {1: 0.0, 2: 0.0, 3: 0.0}
        self._vclock = 0.0
        self.cost = CostModel()
        self.shed = {1: 0, 2: 0, 3: 0}
        self.shed_reason = {"predicted": 0, "full": 0, "timeout": 0}

    # ---- giới hạn ----
    @property
    def max_concurrent(self) -> int:
        """Trần đồng thời đang áp dụng = static_cap bị AIMD kéo xuống khi pod có dấu hiệu quá tải."""
        if not AIMD_ENABLED:
            return self.static_cap
        return max(1, int(self._aimd))

    def _aimd_floor(self) -> float:
        return float(min(self.static_cap, max(MIN_CONCURRENT, self.static_cap * AIMD_MIN_RATIO)))

    def _limit(self, tier: int) -> int:
        return max(1, int(self.max_concurrent * TIER_SLOT_RATIO.get(tier, 0.75)))

    def _queue_limit(self, tier: int) -> int:
        return max(1, int(self.max_queue * TIER_QUEUE_RATIO.get(tier, 0.3)))

    def _eligible(self, tier: int) -> bool:
        used = sum(self.active_by_tier[u] for u in range(tier, 4))
        return used < self._limit(tier)

    def set_capacity(self, cap: int) -> None:
        cap = max(1, cap)
        ratio = min(1.0, self._aimd / self.static_cap)   # giữ nguyên mức đang bị kéo xuống
        self.static_cap = cap
        self._aimd = max(1.0, cap * ratio)
        self._dispatch()

    def _feedback(self, ok: bool | None) -> None:
        """AIMD: ok=False (timeout/5xx/lỗi kết nối) -> giảm nhân; ok=True -> tăng cộng ~ +1 mỗi 'cửa sổ'."""
        if not AIMD_ENABLED or ok is None:
            return
        if ok:
            if self._aimd < self.static_cap:
                self._aimd = min(float(self.static_cap), self._aimd + 1.0 / max(1.0, self._aimd))
            return
        now = time.monotonic()
        if now - self._last_decrease >= AIMD_COOLDOWN:   # một loạt lỗi cùng lúc chỉ tính là 1 lần giảm
            self._last_decrease = now
            self._aimd = max(self._aimd_floor(), self._aimd * AIMD_DECREASE)
            self.aimd_cuts += 1

    # ---- số liệu điều khiển ----
    def pressure(self, tier: int) -> float:
        """Tuổi của vé đầu hàng / queue_timeout (0..1): gần 1 nghĩa là sắp bị loại vì timeout."""
        q = self._queues[tier]
        while q and q[0].fut.done():
            q.popleft()
        if not q:
            return 0.0
        return min(1.0, (time.monotonic() - q[0].t) / QUEUE_TIMEOUTS[tier])

    def _raw_weight(self, tier: int) -> float:
        p = min(self.pressure(tier), PRESSURE_MAX)
        return TIER_BASE_WEIGHT[tier] * (1.0 + PRESSURE_ALPHA * p)

    def weight(self, tier: int) -> float:
        w = self._raw_weight(tier)
        if tier > 1:                                   # áp lực không được đẩy tier thấp vượt Tier 1
            w = min(w, 0.9 * self._raw_weight(1))
        return w

    def predict_wait(self, tier: int, cost: float = 0.0) -> float:
        """Cận trên theo WFQ: tier được ít nhất share*C giây-xử-lý mỗi giây (share = trọng số / tổng
        trọng số các tier đang có hàng), không vượt trần slot của tier."""
        cap = max(1, self.max_concurrent)
        backlog = [t for t in (1, 2, 3) if self.waiting[t] > 0 or t == tier]
        wsum = sum(self.weight(t) for t in backlog)
        share = self.weight(tier) / wsum if wsum > 0 else 1.0
        rate = max(1e-3, min(share * cap, float(self._limit(tier))))
        return (self.queued_work[tier] + cost) / rate + 0.5 * self.active_work / cap

    # ---- nội bộ ----
    
    def _shed(self, tier: int, reason: str) -> None:
        self.shed[tier] += 1
        self.shed_reason[reason] += 1

    def _unqueue(self, tk: _Ticket) -> None:
        if tk.queued:
            tk.queued = False
            self.waiting[tk.tier] = max(0, self.waiting[tk.tier] - 1)
            self.queued_work[tk.tier] = max(0.0, self.queued_work[tk.tier] - tk.cost)

    def _take_slot(self, tier: int, cost: float) -> None:
        self.active += 1
        self.active_work += cost
        self.active_by_tier[tier] += 1

    def _release_slot(self, tier: int, cost: float) -> None:
        self.active = max(0, self.active - 1)
        self.active_work = max(0.0, self.active_work - cost)
        self.active_by_tier[tier] = max(0, self.active_by_tier[tier] - 1)
        self._dispatch()

    def _compact(self) -> None:
        for t, q in self._queues.items():
            if len(q) > 4 * self.max_queue:
                self._queues[t] = deque(x for x in q if not x.fut.done())

    def _dispatch(self) -> None:
        while self.active < self.max_concurrent:
            best = None
            for tier in (1, 2, 3):
                q = self._queues[tier]
                while q and q[0].fut.done():          # vé đã timeout/cancel -> bỏ
                    q.popleft()
                if not q or not self._eligible(tier):
                    continue
                if best is None or self._vtime[tier] < self._vtime[best]:
                    best = tier                        # hoà -> tier nhỏ (ưu tiên hơn) thắng
            if best is None:
                break
            tk = self._queues[best].popleft()
            self._vclock = max(self._vclock, self._vtime[best])
            self._vtime[best] += tk.cost / self.weight(best)
            self._unqueue(tk)
            tk.granted = True
            self._take_slot(best, tk.cost)
            tk.fut.set_result(True)

    # ---- API ----
    async def acquire(self, tier: int, endpoint: str, timeout: float):
        """Trả (permit | None, lý do, chờ_dự_đoán). permit=None: bị loại (predicted/full/timeout)."""
        cost = self.cost.estimate(tier, endpoint)

        # Đi thẳng nếu còn slot và không có ai cùng/ưu tiên hơn đang chờ
        if (self.active < self.max_concurrent and self._eligible(tier)
                and not any(self.waiting[t] for t in range(1, tier + 1))):
            self._take_slot(tier, cost)
            return Permit(tier, cost), "", 0.0

        est = self.predict_wait(tier, cost)
        if est > timeout * ADMIT_MARGIN:
            self._shed(tier, "predicted")
            return None, "predicted", est
        if self.waiting[tier] >= self._queue_limit(tier):
            self._shed(tier, "full")
            return None, "full", est

        fut = asyncio.get_running_loop().create_future()
        tk = _Ticket(tier, cost, fut)
        if self.waiting[tier] == 0:                    # tier vừa có hàng: không được hưởng "tín dụng" cũ
            self._vtime[tier] = max(self._vtime[tier], self._vclock)
        self._queues[tier].append(tk)
        self.waiting[tier] += 1
        self.queued_work[tier] += cost
        self._dispatch()

        try:
            await asyncio.wait_for(fut, timeout)
            return Permit(tier, cost), "", est
        except asyncio.TimeoutError:
            if tk.granted:                             # được cấp slot sát giờ timeout
                return Permit(tier, cost), "", est
            self._shed(tier, "timeout")
            return None, "timeout", est
        except asyncio.CancelledError:
            if tk.granted:                             # đã có slot nhưng client bỏ đi -> trả lại
                self._release_slot(tier, cost)
            raise
        finally:
            self._unqueue(tk)
            self._compact()

    def release(self, permit: Permit, ok: bool | None = None) -> None:
        """ok: True = pod trả <500, False = timeout/5xx/lỗi kết nối, None = không có thông tin."""
        self._feedback(ok)
        self._release_slot(permit.tier, permit.cost)

    def snapshot(self) -> dict:
        return {
            "max_concurrent": self.max_concurrent,
            "static_cap": self.static_cap,
            "aimd_limit": round(self._aimd, 2),
            "aimd_cuts": self.aimd_cuts,
            "active": self.active,
            "active_by_tier": self.active_by_tier,
            "active_work_sec": round(self.active_work, 3),
            "waiting_by_tier": self.waiting,
            "queued_work_sec": {t: round(v, 3) for t, v in self.queued_work.items()},
            "pressure": {t: round(self.pressure(t), 3) for t in (1, 2, 3)},
            "weights": {t: round(self.weight(t), 3) for t in (1, 2, 3)},
            "service_ewma_tier": {t: round(v, 4) for t, v in self.cost.by_tier.items()},
            "service_ewma_endpoint": {k: round(v, 4) for k, v in sorted(self.cost.by_endpoint.items())},
            "shed_by_tier": self.shed,
            "shed_reason": self.shed_reason,
        }


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
    def __init__(self, name: str, cluster_url: str, discovery_host: str, port: int, max_concurrent: int, max_queue: int = 300, per_pod: int = 0, db_budget: int = 0, static_pods: int = 0):
        self.name = name
        self.per_pod = per_pod
        self.db_budget = db_budget
        self.static_pods = static_pods
        self.base_concurrent = max_concurrent
        self.discovery_host = discovery_host
        self.port = port
        self.fallback = Instance(cluster_url)
        self.instances: dict[str, Instance] = {}
        self.limiter = FairLimiter(max_concurrent, max_queue)
        self._rr = 0
        self._discovered_once = False
        self.update_capacity()

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
        """cap của gateway này = min(per_pod * số_pod, db_budget) / (số_gateway * số_worker)."""
        share = max(1, gateway_count) * WORKERS
        if self.per_pod > 0 and LB_MODE != "k8s" and self.instances:
            cap = round(self.per_pod * len(self.instances) / share)
        elif self.per_pod > 0 and self.static_pods > 0:
            cap = round(self.per_pod * self.static_pods / share)
        else:
            cap = round(self.base_concurrent / WORKERS)
        if self.db_budget > 0:
            cap = min(cap, round(self.db_budget / share))
        cap = max(MIN_CONCURRENT, cap)
        if cap != self.limiter.static_cap:
            self.limiter.set_capacity(cap)

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
        return {
            "per_pod": self.per_pod,
            "db_budget": self.db_budget,
            "static_pods": self.static_pods,
            "limiter": self.limiter.snapshot(),
            "clusterip": {"url": self.fallback.url, "active": self.fallback.active, "served": self.fallback.served},
            "instances": [
                {"url": i.url, "active": i.active, "served": i.served, "weight": round(i.weight(), 2)}
                for i in sorted(self.instances.values(), key=lambda x: x.url)
            ],
        }


POOLS = {
    "exam": Pool("exam", "http://exam-service:8001",
                 os.getenv("EXAM_DISCOVERY_HOST", "exam-service-headless"), 8001, 200,
                 per_pod=EXAM_PER_POD, db_budget=EXAM_DB_BUDGET, static_pods=EXAM_STATIC_PODS),
    "auth": Pool("auth", "http://auth-service:8000",
                 os.getenv("AUTH_DISCOVERY_HOST", "auth-service-headless"), 8000, 100,
                 per_pod=AUTH_PER_POD, db_budget=AUTH_DB_BUDGET, static_pods=AUTH_STATIC_PODS),
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

# Mọi thứ không khớp -> DEFAULT_TIER (3). Thêm endpoint lấy đề / xem kết quả vào đây nếu cần ưu tiên.
API_TIERS = [
    (re.compile(r"^/api/v1/attempts/[^/]+/submit/?$"), 1),
    (re.compile(r"^/api/v1/attempts/join/?$"), 1),
    (re.compile(r"^/api/v1/attempts/[^/]+/draft/?$"), 2),
    (re.compile(r"^/api/v1/users/login/?$"), 2),
    (re.compile(r"^/api/v1/auth/login/?$"), 2),
]

_ID_SEG = re.compile(r"^(\d+|[0-9a-fA-F-]{8,})$")


def get_api_tier(path: str) -> int:
    for pattern, tier in API_TIERS:
        if pattern.match(path):
            return tier
    return DEFAULT_TIER


def effective_tier(api_tier: int, role: str | None) -> int:
    """Tag = API x role. Role lấy từ JWT đã ký (không phải header client tự khai)."""
    boost = ROLE_TIER_BOOST.get((role or "").lower(), 0)
    return max(1, api_tier - boost)


def endpoint_key(method: str, path: str) -> str:
    """Chuẩn hoá path (id -> :id) để gom chi phí theo endpoint."""
    segs = [":id" if _ID_SEG.match(s) else s for s in path.strip("/").split("/")[:6]]
    return f"{method} /" + "/".join(segs)


def resolve_service_name(path: str) -> str | None:
    matches = [p for p in SERVICE_ROUTES if path.startswith(p)]
    return SERVICE_ROUTES[max(matches, key=len)] if matches else None


def decode_claims(request: Request) -> dict | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.InvalidTokenError:
        return None
    return payload if isinstance(payload, dict) else None


def claim_role(claims: dict) -> str | None:
    r = claims.get("role_name") or claims.get("role")
    return str(r) if r else None


def claim_user(claims: dict) -> str:
    u = claims.get("sub") or claims.get("user_id") or claims.get("id")
    return str(u) if u else ""


def is_public(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in PUBLIC_PREFIXES)


def client_ip(request: Request) -> str:
    if TRUST_XFF:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


class InflightGate:
    """Đếm request đang bay theo khoá (user/IP); khoá về 0 thì xoá nên bộ nhớ bị chặn bởi số request đang bay."""

    def __init__(self):
        self._n: dict[str, int] = {}

    def enter(self, key: str, limit: int) -> bool:
        n = self._n.get(key, 0)
        if n >= limit:
            return False
        self._n[key] = n + 1
        return True

    def leave(self, key: str) -> None:
        n = self._n.get(key, 0) - 1
        if n <= 0:
            self._n.pop(key, None)
        else:
            self._n[key] = n


gate = InflightGate()


def json_error(detail: str, status: int, headers: dict | None = None) -> Response:
    h = {"x-gateway-pod": GATEWAY_POD}
    if headers:
        h.update(headers)
    return Response(content=json.dumps({"detail": detail}, ensure_ascii=False),
                    status_code=status, headers=h, media_type="application/json")


class BodyTooLarge(Exception):
    pass


async def read_body(request: Request) -> bytes:
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_BODY_BYTES:
        raise BodyTooLarge
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            raise BodyTooLarge
        chunks.append(chunk)
    return b"".join(chunks)


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
    """Đếm số gateway Ready để chia đều giới hạn (HPA đổi số gateway -> giới hạn tự đổi theo)."""
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
    client = httpx.AsyncClient(limits=limits, timeout=httpx.Timeout(None, connect=3.0))
    tasks: list[asyncio.Task] = []
    if LB_MODE != "k8s":
        for pool in POOLS.values():
            try:
                await pool.refresh()
            except Exception as exc:
                print(f"[discovery] {pool.name} (lần đầu): {exc}")
            tasks.append(asyncio.create_task(discovery_loop(pool)))
    if any(p.per_pod > 0 or p.db_budget > 0 for p in POOLS.values()):
        tasks.append(asyncio.create_task(gateway_count_loop()))
    print(f"[gateway] v8 LB_MODE={LB_MODE} pod={GATEWAY_POD}")
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await client.aclose()


app = FastAPI(title="API Gateway v8 - Fair Work-Based Queue + AIMD", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/debug/state")
async def debug_state(request: Request):
    if DEBUG_TOKEN and not hmac.compare_digest(request.headers.get("x-debug-token", ""), DEBUG_TOKEN):
        return json_error("Not Found", 404)
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
                  body: bytes, timeout: float) -> tuple[httpx.Response, Instance, float]:
    """Chỉ retry khi LỖI KẾT NỐI (request chưa tới pod nên an toàn với mọi method)."""
    inst = pool.pick()
    for attempt in (0, 1):
        used = inst
        used.active += 1
        t0 = time.perf_counter()
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
            return resp, used, time.perf_counter() - t0
        except (httpx.ConnectError, httpx.ConnectTimeout):
            if attempt == 0 and LB_MODE != "k8s":
                inst = pool.pick(exclude=used)
                continue
            raise
        finally:
            used.active -= 1
    raise RuntimeError("unreachable")


# ---------- Lớp 1: hứng request (route, xác thực, giới hạn theo user, gắn tag) ----------
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(full_path: str, request: Request):
    path = f"/{full_path}"

    if request.method == "OPTIONS":
        return Response(status_code=200)

    service_name = resolve_service_name(path)
    if service_name is None:
        return json_error("Not Found", 404)

    role: str | None = None
    gate_key, gate_limit = "", 0
    if is_public(path):
        if PUBLIC_IP_INFLIGHT > 0:
            gate_key, gate_limit = "ip:" + client_ip(request), PUBLIC_IP_INFLIGHT
    else:
        claims = decode_claims(request)
        if claims is None:
            return json_error("Token không hợp lệ hoặc đã hết hạn", 401)
        role = claim_role(claims)
        uid = claim_user(claims)
        if uid and PER_USER_INFLIGHT > 0:
            gate_key, gate_limit = "u:" + uid, PER_USER_INFLIGHT

    counted = False
    if gate_key:
        if not gate.enter(gate_key, gate_limit):
            return json_error("Bạn đang gửi quá nhiều yêu cầu cùng lúc", 429,
                              {"Retry-After": "1", "x-shed-reason": "user-limit"})
        counted = True
    try:
        return await admit_and_forward(request, path, service_name, role)
    finally:
        if counted:
            gate.leave(gate_key)


# ---------- Lớp 2: đưa request vào hệ thống (hàng đợi công bằng + AIMD) ----------
async def admit_and_forward(request: Request, path: str, service_name: str, role: str | None) -> Response:
    # Đọc body TRƯỚC khi giữ slot: client chậm/ngắt không chiếm chỗ của người khác
    try:
        body = await asyncio.wait_for(read_body(request), timeout=BODY_READ_TIMEOUT)
    except BodyTooLarge:
        return json_error("Payload Too Large", 413)
    except asyncio.TimeoutError:
        return json_error("Client gửi dữ liệu quá chậm", 408)
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}

    pool = POOLS[service_name]
    tier = effective_tier(get_api_tier(path), role)
    ek = endpoint_key(request.method, path)

    t_enq = time.monotonic()
    permit, reason, est = await pool.limiter.acquire(tier, ek, QUEUE_TIMEOUTS[tier])
    if permit is None:
        retry = max(RETRY_AFTER[tier], min(30, math.ceil(est)))
        return json_error("Hệ thống đang quá tải, vui lòng thử lại sau", 503,
                          {"Retry-After": str(retry), "x-shed-reason": reason})
    queue_wait = time.monotonic() - t_enq

    ok: bool | None = None          # phản hồi cho AIMD; mọi đường thoát đều đi qua finally -> luôn trả slot
    try:
        try:
            resp, inst, elapsed = await forward(pool, request, path, headers, body, TIER_TIMEOUTS[tier])
        except (asyncio.TimeoutError, httpx.TimeoutException):
            ok = False
            # slot đã bị giữ cả TIER_TIMEOUTS giây: đó là chi phí thật, không được bỏ qua
            pool.limiter.cost.observe(tier, ek, TIER_TIMEOUTS[tier], censored=True)
            return json_error("Hệ thống xử lý quá lâu", 504)
        except httpx.RequestError:
            ok = False
            return json_error("Service Unavailable", 503)

        status = resp.status_code
        ok = status < 500
        if status < 400:            # 4xx trả nhanh (validate/409...) không phản ánh chi phí thật
            pool.limiter.cost.observe(tier, ek, elapsed)

        out_headers = {k: v for k, v in resp.headers.items() if k.lower() not in STRIP_RESPONSE}
        out_headers.update({
            "x-gateway-instance": inst.label,
            "x-gateway-pod": GATEWAY_POD,
            "x-lb-mode": LB_MODE,
            "x-request-tier": str(tier),
            "x-queue-wait-ms": str(int(queue_wait * 1000)),
        })
        return Response(
            content=resp.content,
            status_code=status,
            headers=out_headers,
            media_type=resp.headers.get("content-type"),
        )
    finally:
        pool.limiter.release(permit, ok)
