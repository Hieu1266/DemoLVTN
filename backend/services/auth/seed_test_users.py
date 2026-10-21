from sqlmodel import Session, select
from app.core.database import engine
from app.core.security import hash_password
from app.models.user import User
from app.models.profile import Profile
from app.core.roles import ROLES

def seed_k6_users(count=3000):
    with Session(engine) as session:
        created_count = 0
        for i in range(1, count + 1):
            email = f"student{i}@lumer.edu.vn"
            username = f"student{i}"
            
            # Cú pháp chuẩn SQLModel thay thế cho session.query()
            existing_user = session.exec(select(User).where(User.email == email)).first()
            if not existing_user:
                user = User(
                    username=username,
                    email=email,
                    password=hash_password("Password123!"),
                    role_id=ROLES.get("STUDENT", 3),
                    status_id="ACTIVE"
                )
                session.add(user)
                session.flush()
                
                profile = Profile(
                    user_id=user.user_id, 
                    firstname="Student", 
                    lastname=str(i)
                )
                session.add(profile)
                created_count += 1
                
        session.commit()
        print(f"Đã tạo thành công {created_count} tài khoản sinh viên mới vào CSDL!")

if __name__ == "__main__":
    seed_k6_users(3000)