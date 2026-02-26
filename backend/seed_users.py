import sys
import os
from sqlalchemy.orm import Session
from passlib.context import CryptContext

# Add the project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal, engine, Base
from backend.config import AUTH_USERS
from backend.models import User

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def seed_users():
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    users_to_create = AUTH_USERS
    
    for user_data in users_to_create:
        existing_user = db.query(User).filter(User.username == user_data["username"]).first()
        if not existing_user:
            user = User(
                username=user_data["username"],
                full_name=user_data["full_name"],
                password_hash=get_password_hash(user_data["password"]),
                is_active=True,
                is_admin=user_data.get("is_admin", False)
            )
            db.add(user)
            print(f"Created user: {user_data['username']} (admin={user_data.get('is_admin', False)})")
        else:
            existing_user.password_hash = get_password_hash(user_data["password"])
            existing_user.full_name = user_data["full_name"]
            existing_user.is_admin = user_data.get("is_admin", False)
            print(f"Updated user: {user_data['username']} (admin={user_data.get('is_admin', False)})")
            
    db.commit()
    db.close()

if __name__ == "__main__":
    seed_users()
