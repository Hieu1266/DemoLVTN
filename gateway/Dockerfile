# ==========================================
# Stage 1: Builder (Cài đặt thư viện với uv)
# ==========================================
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Lấy công cụ 'uv' siêu tốc từ official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy file định nghĩa thư viện
COPY requirements.txt .

# Tạo .venv và cài đặt thư viện với cache mount (Tăng tốc rebuild Docker)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /app/.venv && \
    . /app/.venv/bin/activate && \
    uv pip install -r requirements.txt

# ==========================================
# Stage 2: Runner (Môi trường chạy siêu nhẹ & bảo mật)
# ==========================================
FROM python:3.11-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Cài đặt ca-certificates & curl (phục vụ Healthcheck & SSL outbound)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Tạo Non-root User bảo mật
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

# Copy môi trường ảo .venv từ builder
COPY --from=builder --chown=appuser:appgroup /app/.venv /app/.venv

# Copy toàn bộ mã nguồn Gateway
COPY --chown=appuser:appgroup . /app

USER appuser

# Cổng mặc định của API Gateway
EXPOSE 8088

# Healthcheck tự động gọi endpoint /health của Gateway
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8088/health || exit 1

# Khởi chạy API Gateway
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8088"]