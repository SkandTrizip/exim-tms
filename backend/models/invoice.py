from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"))
    invoice_number = Column(String, index=True, unique=True)
    invoice_date = Column(Date)
    place_of_supply = Column(String)
    payment_due_date = Column(Date)
    irn = Column(String, nullable=True)
    status = Column(String, default="draft")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship to Enquiry
    # enquiry = relationship("Enquiry", back_populates="invoices")
