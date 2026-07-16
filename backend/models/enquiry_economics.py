from sqlalchemy import Column, Integer, Float, DateTime, Date, ForeignKey
from backend.database import Base
import datetime


class EnquiryEconomics(Base):
    """
    Per-enquiry cost and revenue for dashboard analytics.
    Auto-synced from final quote when present, else accepted source quote
    (shipping-line rate = cost, client rate = revenue), plus additional invoice
    line items (added equally to both).
    sob_date mirrors shipment SOB for month-wise margin attribution.
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
    sob_date = Column(Date, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )
