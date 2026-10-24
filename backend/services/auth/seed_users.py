import asyncio
import json
import httpx

# Cấu hình URL Auth Service (NodePort trên K8s)
BASE_URL = "http://localhost:31000"  
REGISTER_URL = f"{BASE_URL}/api/v1/users/register"
LOGIN_URL = f"{BASE_URL}/api/v1/users/login"

# Nâng số lượng user cần tạo lên 2000
NUM_USERS = 2000

async def create_user(client, index, semaphore):
    async with semaphore:
        username = f"student_{index}"
        password = "Password123!"
        email = f"student_{index}@exam.com"

        # Payload Đăng ký
        reg_payload = {
            "username": username,
            "email": email,
            "password": password,
            "full_name": f"Student Test {index}",
            "role": "student"
        }

        try:
            # 1. Gọi API Register
            await client.post(REGISTER_URL, json=reg_payload)
            
            # 2. Gọi API Login lấy Token sẵn
            login_payload = {"username": username, "password": password}
            login_resp = await client.post(LOGIN_URL, json=login_payload)
            
            token = ""
            if login_resp.status_code == 200:
                data = login_resp.json()
                token = data.get("access_token") or data.get("token", "")

            return {
                "id": index,
                "username": username,
                "password": password,
                "token": token
            }
        except Exception as e:
            print(f"❌ Lỗi tạo user {username}: {e}")
            return None

async def main():
    print(f"🚀 Đang khởi tạo {NUM_USERS} users vào Database...")
    # Giữ Semaphore = 50 để gửi request dồn dập nhưng không làm ngợp DB lúc seed
    semaphore = asyncio.Semaphore(50)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [create_user(client, i, semaphore) for i in range(1, NUM_USERS + 1)]
        results = await asyncio.gather(*tasks)

    valid_users = [u for u in results if u is not None]
    print(f"✅ Đã tạo thành công {len(valid_users)}/{NUM_USERS} users!")

    # Lưu ra file users.json để K6 dùng
    with open("users.json", "w", encoding="utf-8") as f:
        json.dump(valid_users, f, indent=2, ensure_ascii=False)
    print("📁 Đã cập nhật file 'users.json' với 2,000 users!")

if __name__ == "__main__":
    asyncio.run(main())