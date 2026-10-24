import asyncio
import json
import httpx

BASE_URL = "http://localhost:31000"  
REGISTER_URL = f"{BASE_URL}/api/v1/users/register"
LOGIN_URL = f"{BASE_URL}/api/v1/users/login"

NUM_USERS = 2000

async def create_and_login_user(client, index, semaphore):
    async with semaphore:
        username = f"student_{index}"
        password = "Password123!"
        email = f"student_{index}@exam.com"

        reg_payload = {
            "username": username,
            "email": email,
            "password": password,
            "full_name": f"Student Test {index}",
            "role": "student"
        }

        # 1. Register User
        try:
            await client.post(REGISTER_URL, json=reg_payload)
        except Exception:
            pass

        # 2. Login User (Thử gửi data dạng x-www-form-urlencoded chuẩn OAuth2 của FastAPI)
        login_form_data = {
            "username": username, # Hoặc thay email nếu backend bắt đăng nhập bằng email
            "password": password
        }

        token = ""
        try:
            # Gửi dạng data= thay vì json= để chuẩn x-www-form-urlencoded
            login_resp = await client.post(LOGIN_URL, data=login_form_data)
            
            # Nếu vẫn 422, thử fallback gửi bằng json
            if login_resp.status_code == 422:
                login_resp = await client.post(LOGIN_URL, json={"username": username, "password": password})
                if login_resp.status_code == 422:
                    login_resp = await client.post(LOGIN_URL, json={"email": email, "password": password})

            if login_resp.status_code == 200:
                res_json = login_resp.json()
                token = res_json.get("access_token") or res_json.get("token", "")
            else:
                if index == 1: # In ra body lỗi của user đầu tiên để dễ check field
                    print(f"❌ Chi tiết lỗi Status {login_resp.status_code}: {login_resp.text}")
        except Exception as e:
            print(f"❌ Exception user {username}: {e}")

        return {
            "id": index,
            "username": username,
            "password": password,
            "token": token
        }

async def main():
    print(f"🚀 Đang tạo và lấy Token cho {NUM_USERS} users...")
    semaphore = asyncio.Semaphore(50)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [create_and_login_user(client, i, semaphore) for i in range(1, NUM_USERS + 1)]
        results = await asyncio.gather(*tasks)

    valid_users = [u for u in results if u is not None]
    success_tokens = [u for u in valid_users if u["token"] != ""]
    
    print(f"\n✅ Đã cấp Token thành công cho {len(success_tokens)}/{NUM_USERS} users!")

    with open("users.json", "w", encoding="utf-8") as f:
        json.dump(valid_users, f, indent=2, ensure_ascii=False)
    print("📁 Đã lưu danh sách vào file 'users.json'!")

if __name__ == "__main__":
    asyncio.run(main())