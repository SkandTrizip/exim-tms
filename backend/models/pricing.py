from sqlalchemy import Column, Integer, String, Float, ForeignKey
from backend.database import Base

class Pricing(Base):
    __tablename__ = "pricing"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"))
    quote_amount = Column(Float)
    currency = Column(String, default="USD")
    valid_until = Column(String)
