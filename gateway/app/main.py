"""
API Gateway - FastAPI Reverse Proxy + Load Shedding + K8s Optimized
-------------------------------------------------------------------
"""

import os
import re
import jwt
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
JWT_SECRET = os.getenv("SECRET_KEY", "your_super_secret_key")
JWT_ALG = os.getenv("ALGORITHM", "HS256")

PUBLIC_PREFIXES = (
    "/api/v1/users/login",
    "/api/v1/users/register",
    "/health",
    "/docs",
    "/openapi.json"
)

app = FastAPI(title="API Gateway - K8s Fail-Fast")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 1. TRỎ ĐÚNG K8S SERVICE DNS (K8s tự cân bằng tải giữa các Pod Replicas)
# ============================================================
SERVICE_INSTANCES = {
    "exam": [{"url": "http://exam-service:8001", "weight": 1.0, "active": 0}],
    "auth": [{"url": "http://auth-service:8000", "weight": 1.0, "active": 0}],
}

# Giới hạn số request xử lý đồng thời tối đa để bảo vệ Backend
MAX_CONCURRENT_LIMIT = {
    "exam": 200, 
    "auth": 100,
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

# Phân cấp độ ưu tiên API
API_TIERS = [
    (re.compile(r"^/api/v1/exams/.*?/submit$"), 1),   # Tier 1: Nộp bài (Ưu tiên tuyệt đối)
    (re.compile(r"^/api/v1/attempts/join$"), 1),      # Tier 1: Join phòng thi
    (re.compile(r"^/api/v1/exams/.*?/start$"), 2),    # Tier 2: Bắt đầu làm bài
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
# 2. LOAD SHEDDING (FAIL FAST TRONG 0MS - KHÔNG NGÂM QUEUE)
# ============================================================
def should_drop_request(service_name: str, tier: int) -> bool:
    instance = SERVICE_INSTANCES[service_name][0]
    max_limit = MAX_CONCURRENT_LIMIT.get(service_name, 100)
    
    # Nếu đang chạm ngưỡng tối đa -> Chỉ cho Tier 1 (Nộp bài/Join) đi qua
    if instance["active"] >= max_limit:
        return tier > 1
    return False

# ============================================================
# 3. HTTP CLIENT POOL TỐI ƯU CHO CAO TẢI
# ============================================================
client: httpx.AsyncClient | None = None

@app.on_event("startup")
async def startup():
    global client
    # Cấu hình Pool lớn tránh nghẽn socket
    limits = httpx.Limits(max_keepalive_connections=300, max_connections=1500)
    client = httpx.AsyncClient(limits=limits, timeout=10.0)

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

@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(full_path: str, request: Request):
    path = f"/{full_path}"
    
    if request.method == "OPTIONS":
        return Response(status_code=200)

    service_name = resolve_service_name(path)
    if service_name is None:
        return Response(content='{"detail": "Not Found"}', status_code=404)

    is_public = any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)
    role = extract_role(request)

    if not is_public and role is None:
        return Response(
            content='{"detail": "Token khong hop le hoac da het han"}',
            status_code=401,
            media_type="application/json",
        )

    tier = get_api_tier(path)

    # 1. BẢO VỆ HỆ THỐNG: Nếu quá tải từ chối ngay (Trả 503)
    if should_drop_request(service_name, tier):
        return Response(
            content='{"detail": "He thong đang qua tai, vui long thu lai sau"}',
            status_code=503,
            headers={"Retry-After": "2"},
            media_type="application/json",
        )

    instance = SERVICE_INSTANCES[service_name][0]
    instance["active"] += 1

    try:
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
            k: v for k, v in upstream_response.headers.items()
            if k.lower() not in ("content-encoding", "transfer-encoding", "content-length")
        }

        return Response(
            content=upstream_response.content,
            status_code=upstream_response.status_code,
            headers=resp_headers,
            media_type=upstream_response.headers.get("content-type"),
        )
    except httpx.RequestError:
        return Response(content='{"detail": "Service Unavailable"}', status_code=503)
    finally:
        instance["active"] = max(0, instance["active"] - 1)