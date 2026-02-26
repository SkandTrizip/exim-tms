from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from urllib.parse import quote_plus

# Database configuration - using environment variables for safety
POSTGRES_USER = os.getenv("POSTGRES_USER", "tmsbackend")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "sharkship@5")
POSTGRES_DB = os.getenv("POSTGRES_DB", "exim_prod")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "generalagent.postgres.database.azure.com")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

# URL-encode the password to handle special characters like '@'
encoded_password = quote_plus(POSTGRES_PASSWORD)

SQLALCHEMY_DATABASE_URL = f"postgresql://{POSTGRES_USER}:{encoded_password}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # Re-test connections before using them — transparently reconnects if
    # Azure has dropped the idle connection (the main cause of this error).
    pool_pre_ping=True,
    # Recycle connections every 10 minutes so they are never older than
    # Azure's idle-connection timeout (~10–15 min on the Flexible Server).
    pool_recycle=600,
    # Keep up to 10 connections open in the pool.
    pool_size=10,
    # Allow up to 20 extra connections to be created at peak load.
    max_overflow=20,
    # Wait at most 30 s for a connection from the pool before raising.
    pool_timeout=30,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
