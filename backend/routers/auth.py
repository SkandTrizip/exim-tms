from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt

from backend.database import get_db
from backend.models.user import User
from backend.schemas.user import Token, UserLogin
from backend.utils.logger import logger
from backend.config import ADMIN_USERS

router = APIRouter()

# ── Config ─────────────────────────────────────────────────────────────────────
SECRET_KEY = "exim_tms_secret_key_change_in_production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

# ── Helpers ────────────────────────────────────────────────────────────────────

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ── Shared auth dependencies ───────────────────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Return the User for this token, or None if no / invalid token."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            return None
        return db.query(User).filter(User.username.ilike(username)).first()
    except JWTError:
        return None

def require_admin(
    current_user: Optional[User] = Depends(get_current_user)
) -> User:
    """Raise 401/403 if caller is not an admin."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    if current_user.username.lower() not in ADMIN_USERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

# ── Login endpoints ────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    try:
        user = db.query(User).filter(User.username.ilike(form_data.username)).first()
        if not user or not verify_password(form_data.password, user.password_hash):
            logger.warning(f"Failed login attempt for username: {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = create_access_token(
            data={"sub": user.username},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        logger.info(f"User {user.username} logged in (form).")
        return {"access_token": token, "token_type": "bearer", "username": user.username}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error (form): {e}")
        raise HTTPException(status_code=500, detail=f"Login error: {e}")


@router.post("/login-json", response_model=Token)
def login_json(user_data: UserLogin, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.username.ilike(user_data.username)).first()
        if not user or not verify_password(user_data.password, user.password_hash):
            logger.warning(f"Failed JSON login for: {user_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )
        token = create_access_token(
            data={"sub": user.username},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        logger.info(f"User {user.username} logged in (JSON).")
        return {"access_token": token, "token_type": "bearer", "username": user.username}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error (JSON): {e}")
        raise HTTPException(status_code=500, detail=f"Login error: {e}")
