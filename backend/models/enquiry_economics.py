from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey
from backend.database import Base
import datetime


class EnquiryEconomics(Base):
    """
    Per-enquiry cost and revenue for dashboard analytics.
    Populate via SQL/script — one row per enquiry (enquiry_id is unique).
    """
    __tablename__ = "enquiry_economics"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(
        Integer,
        ForeignKey("enquiries.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    cost_inr = Column(Float, nullable=False, default=0.0)
    revenue_inr = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )
