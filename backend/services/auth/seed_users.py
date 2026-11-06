
# import asyncio
# import json
# import httpx

# BASE_URL = "http://localhost:31000"
# REGISTER_URL = f"{BASE_URL}/api/v1/users/register"
# LOGIN_URL = f"{BASE_URL}/api/v1/users/login"

# NUM_USERS = 40000
# CONCURRENCY = 20
# PASSWORD = "Password123!"


# async def create_and_login_user(client, index, semaphore):
#     username = f"student_{index}"
#     email = f"student_{index}@exam.com"

#     # Lưu ý: cần đối chiếu UserCreate để xác nhận trường role
#     # và các trường bắt buộc trước khi chạy toàn bộ 4000 users.
#     register_payload = {
#         "username": username,
#         "email": email,
#         "password": PASSWORD,
#         "full_name": f"Student Test {index}",
#         "role": "student",
#     }

#     result = {
#         "id": index,
#         "username": username,
#         "email": email,
#         "password": PASSWORD,
#         "registered": False,
#         "register_status": None,
#         "login_status": None,
#         "token": "",
#         "error": None,
#     }

#     async with semaphore:
#         try:
#             reg_resp = await client.post(
#                 REGISTER_URL,
#                 json=register_payload,
#             )
#             result["register_status"] = reg_resp.status_code

#             # 201: tạo mới thành công.
#             # 409: tài khoản đã tồn tại; vẫn thử đăng nhập.
#             if reg_resp.status_code == 201:
#                 result["registered"] = True
#             elif reg_resp.status_code != 409:
#                 result["error"] = (
#                     f"Register {reg_resp.status_code}: "
#                     f"{reg_resp.text[:500]}"
#                 )
#                 return result

#             # Login endpoint đọc data.email, không phải username.
#             login_resp = await client.post(
#                 LOGIN_URL,
#                 json={
#                     "email": email,
#                     "password": PASSWORD,
#                 },
#             )
#             result["login_status"] = login_resp.status_code

#             if login_resp.status_code == 200:
#                 body = login_resp.json()
#                 result["token"] = body.get("access_token", "")
#             else:
#                 result["error"] = (
#                     f"Login {login_resp.status_code}: "
#                     f"{login_resp.text[:500]}"
#                 )

#         except httpx.TimeoutException:
#             result["error"] = "Timeout"
#         except httpx.HTTPError as exc:
#             result["error"] = f"HTTP error: {exc}"
#         except Exception as exc:
#             result["error"] = f"Unexpected error: {exc}"

#     return result


# async def main():
#     print(f"Bat dau xu ly {NUM_USERS} tai khoan...")

#     semaphore = asyncio.Semaphore(CONCURRENCY)
#     limits = httpx.Limits(
#         max_connections=CONCURRENCY,
#         max_keepalive_connections=CONCURRENCY,
#     )
#     timeout = httpx.Timeout(30.0)

#     # Chia theo từng đợt để không tạo cùng lúc 4000 coroutine.
#     results = []

#     async with httpx.AsyncClient(
#         timeout=timeout,
#         limits=limits,
#     ) as client:
#         for start in range(1, NUM_USERS + 1, 200):
#             end = min(start + 199, NUM_USERS)
#             batch = [
#                 create_and_login_user(client, i, semaphore)
#                 for i in range(start, end + 1)
#             ]
#             batch_results = await asyncio.gather(*batch)
#             results.extend(batch_results)

#             token_count = sum(
#                 bool(user["token"]) for user in results
#             )
#             print(
#                 f"Da xu ly {end}/{NUM_USERS}; "
#                 f"token thanh cong: {token_count}"
#             )

#             # Lưu tiến độ sau mỗi đợt để giảm nguy cơ mất dữ liệu
#             with open("users.json", "w", encoding="utf-8") as f:
#                 json.dump(results, f, indent=2, ensure_ascii=False)

#     success_tokens = sum(bool(u["token"]) for u in results)
#     register_201 = sum(u["register_status"] == 201 for u in results)
#     register_409 = sum(u["register_status"] == 409 for u in results)
#     login_422 = sum(u["login_status"] == 422 for u in results)
#     login_401 = sum(u["login_status"] == 401 for u in results)
#     errors = sum(bool(u["error"]) for u in results)

#     print("\n===== KET QUA =====")
#     print(f"Da xu ly: {len(results)}/{NUM_USERS}")
#     print(f"Dang ky moi thanh cong (201): {register_201}")
#     print(f"Tai khoan trung (409): {register_409}")
#     print(f"Login 422: {login_422}")
#     print(f"Login 401: {login_401}")
#     print(f"Loi/timeout khac: {errors}")
#     print(f"Lay token thanh cong: {success_tokens}")
#     print("Da luu tien do vao users.json")


# if __name__ == "__main__":
#     asyncio.run(main())



# ----------------
import asyncio
import json
import httpx

BASE_URL = "http://localhost:31000"
LOGIN_URL = f"{BASE_URL}/api/v1/users/login"
PASSWORD_INSTRUCTOR = "instructor123"
PASSWORD_STUDENT = "Password123!"

# 1. Tài khoản Admin thực tế
ADMIN_ACCOUNT = {
    "email": "admin@gmail.com",
    "pass": "admin123",
    "user": "admin",
    "role": "ADMIN"
}

# 2. Danh sách Giảng viên thực tế (role_id = 3 trong CSDL)
INSTRUCTORS = [
    {"email": "giangvien@gmail.com", "pass": "instructor123", "user": "instructor"},
    {"email": "annguyenthigia@lumer.edu.vn", "pass": "instructor123", "user": "an.nguyenthigia"},
    {"email": "viengiang@lumer.edu.vn", "pass": "instructor123", "user": "vien.giang"},
]
for i in range(1, 11):
    INSTRUCTORS.append({
        "email": f"instructor_{i}@lumer.edu.vn",
        "pass": PASSWORD_INSTRUCTOR,
        "user": f"instructor_{i}"
    })

NUM_STUDENTS = 40000
CONCURRENCY = 30

async def login(client, email, password, role, username, idx, semaphore):
    res = {"id": idx, "username": username, "email": email, "role": role, "token": ""}
    async with semaphore:
        try:
            resp = await client.post(LOGIN_URL, json={"email": email, "password": password})
            if resp.status_code == 200:
                res["token"] = resp.json().get("access_token", "")
        except Exception:
            pass
    return res

async def main():
    print("🚀 Đang tiến hành đăng nhập lấy Token cho Admin, Giảng viên và Sinh viên...")
    semaphore = asyncio.Semaphore(CONCURRENCY)
    limits = httpx.Limits(max_connections=CONCURRENCY, max_keepalive_connections=CONCURRENCY)
    
    users_data = []
    async with httpx.AsyncClient(timeout=30.0, limits=limits) as client:
        # 1. Đăng nhập Admin
        r_admin = await login(client, ADMIN_ACCOUNT["email"], ADMIN_ACCOUNT["pass"], ADMIN_ACCOUNT["role"], ADMIN_ACCOUNT["user"], 0, semaphore)
        if r_admin["token"]:
            users_data.append(r_admin)
            print(f"  [✓] Token Admin OK: {ADMIN_ACCOUNT['email']}")
        else:
            print(f"  [✗] Đăng nhập Admin thất bại: {ADMIN_ACCOUNT['email']}")

        # 2. Đăng nhập Giảng viên (role_id = 3)
        for idx, ins in enumerate(INSTRUCTORS, start=1):
            r = await login(client, ins["email"], ins["pass"], "TEACHER", ins["user"], idx, semaphore)
            if r["token"]:
                users_data.append(r)
                print(f"  [✓] Token Giảng viên OK: {ins['email']}")

        # 3. Đăng nhập Sinh viên (role_id = 2)
        for start in range(1, NUM_STUDENTS + 1, 500):
            end = min(start + 499, NUM_STUDENTS)
            batch = [
                login(client, f"student_{i}@exam.com", PASSWORD_STUDENT, "STUDENT", f"student_{i}", i + 100, semaphore)
                for i in range(start, end + 1)
            ]
            batch_res = await asyncio.gather(*batch)
            users_data.extend([u for u in batch_res if u["token"]])
            print(f"🔄 Đã load {end}/{NUM_STUDENTS} sinh viên...")

    with open("users.json", "w", encoding="utf-8") as f:
        json.dump(users_data, f, indent=2, ensure_ascii=False)

    admin_count = sum(1 for u in users_data if u["role"] == "ADMIN")
    teacher_count = sum(1 for u in users_data if u["role"] == "TEACHER")
    student_count = sum(1 for u in users_data if u["role"] == "STUDENT")
    print(f"\n🎉 HOÀN TẤT: Đã ghi users.json | Admin: {admin_count} | Giảng viên: {teacher_count} | Sinh viên: {student_count}")

if __name__ == "__main__":
    asyncio.run(main())