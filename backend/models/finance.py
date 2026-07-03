from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Date
from sqlalchemy.dialects.postgresql import ARRAY
from backend.database import Base
import datetime

class ShippingPayment(Base):
    __tablename__ = "shipping_payments"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"))
    # Postgres: text[] (supports multiple UTRs per payment row)
    utr_number = Column(ARRAY(String))
    # Postgres: date[] (supports multiple payment dates per UTR row)
    payment_date = Column(ARRAY(Date))
    amount = Column(Float)
    currency = Column(String, default="INR")
    description = Column(String, nullable=True)
    payment_type = Column(String, default="Main") # "Main" or "Additional"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
