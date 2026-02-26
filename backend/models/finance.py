from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Date
from backend.database import Base
import datetime

class ShippingPayment(Base):
    __tablename__ = "shipping_payments"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"))
    utr_number = Column(String, index=True)
    payment_date = Column(Date)
    amount = Column(Float)
    currency = Column(String, default="INR")
    description = Column(String, nullable=True)
    payment_type = Column(String, default="Main") # "Main" or "Additional"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
