"""Gia hạn token trong users.json cho bài test dài hạn (CHỈ dùng ở môi trường test).

Ý tưởng: token cũ do auth-service ký, nên chỉ cần đọc các claim (sub, role, ...) rồi ký lại
bằng cùng SECRET_KEY với `exp` mới. Không cần đăng nhập lại 40.000 tài khoản.

Cách dùng (PowerShell, trong thư mục có users.json):
    $env:SECRET_KEY = "<cùng giá trị SECRET_KEY của auth-service / exam-service>"
    python extend_tokens.py --days 365

Tuỳ chọn:
    --alg HS256         thuật toán (mặc định lấy từ ALGORITHM, nếu không có thì HS256)
    --src / --dst       file đầu vào / đầu ra (mặc định cùng là users.json, có tạo bản .bak)
"""
import argparse
import json
import os
import shutil
import sys
import time

import jwt


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--secret", default=os.getenv("SECRET_KEY"))
    ap.add_argument("--alg", default=os.getenv("ALGORITHM", "HS256"))
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--src", default="users.json")
    ap.add_argument("--dst", default="users.json")
    args = ap.parse_args()

    if not args.secret:
        sys.exit("Thiếu SECRET_KEY: đặt biến môi trường SECRET_KEY hoặc truyền --secret.")

    with open(args.src, encoding="utf-8") as f:
        users = json.load(f)

    if args.src == args.dst:
        shutil.copyfile(args.src, args.src + ".bak")
        print(f"Đã sao lưu: {args.src}.bak")

    now = int(time.time())
    exp = now + args.days * 86400
    done = skipped = 0

    for u in users:
        tok = u.get("token")
        if not tok:
            skipped += 1
            continue
        try:
            # Chỉ đọc claim, không kiểm tra chữ ký/hạn (token cũ có thể đã hết hạn)
            claims = jwt.decode(tok, options={"verify_signature": False, "verify_exp": False})
        except jwt.PyJWTError:
            skipped += 1
            continue
        claims["iat"] = now
        claims["exp"] = exp
        u["token"] = jwt.encode(claims, args.secret, algorithm=args.alg)
        done += 1

    # Kiểm tra lại một token bằng chính khóa này, để chắc chữ ký hợp lệ
    sample = next((u["token"] for u in users if u.get("token")), None)
    if sample:
        payload = jwt.decode(sample, args.secret, algorithms=[args.alg])
        print("Claim của token mẫu:", {k: payload[k] for k in payload if k not in ("iat",)})

    with open(args.dst, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False)

    print(f"Đã gia hạn {done} token, bỏ qua {skipped}. Hạn mới: {args.days} ngày.")


if __name__ == "__main__":
    main()



