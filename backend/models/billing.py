from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from backend.database import Base
import datetime

class Billing(Base):
    __tablename__ = "billing"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, index=True)
    amount = Column(Float)
    is_paid = Column(Boolean, default=False)
    due_date = Column(DateTime)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
