"""Thêm header X-Pod-Name (tên pod) vào mọi phản hồi của exam-service.

Gateway chuyển tiếp nguyên header này, lb_test.js đọc nó thành tag `pod`, và analyze_lb.py dùng
nó để đếm request theo từng pod ở MỌI chế độ (k8s, rr, least, p2c). Nhờ vậy không còn phụ thuộc
vào pod_load.ps1 và cửa sổ 10 phút của nó.

Cách dùng trong exam-service (file tạo app FastAPI, ví dụ main.py):

    from app.pod_name_middleware import PodNameMiddleware   # đổi đường dẫn cho khớp dự án
    app.add_middleware(PodNameMiddleware)

Kubernetes tự đặt biến môi trường HOSTNAME bằng tên pod nên không cần cấu hình thêm.
"""
import os

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class PodNameMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.value = os.getenv("HOSTNAME", "unknown").encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-pod-name", self.value))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_header)