from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float
from backend.database import Base
import datetime

class Overhead(Base):
    """
    Master catalogue of intermittent overheads (occasional charges such as
    detention, demurrage, examination, amendment fees, etc.) that can be
    booked as payable line items against a shipment in Finance.
    """
    __tablename__ = "overheads"

    id = Column(Integer, primary_key=True, index=True)

    # Identity
    overhead_name = Column(String, index=True)
    category      = Column(String)          # e.g. Detention, Demurrage, Documentation
    description   = Column(String)

    # Defaults applied when the overhead is booked in Finance
    default_currency = Column(String, default="INR")
    default_amount   = Column(Float)        # optional suggested amount
    hsn_sac          = Column(String)       # HSN/SAC code for invoicing
    gst_rate         = Column(Float)        # GST % (optional)
    gst_applicable   = Column(Boolean, default=False)

    # Verification workflow (mirrors other masters)
    status       = Column(String, default="pending")  # pending | verified | rejected
    submitted_by = Column(String)
    verified_by  = Column(String)
    verified_at  = Column(DateTime)

    created_at  = Column(DateTime, default=datetime.datetime.utcnow)
    modified_at = Column(DateTime, onupdate=datetime.datetime.utcnow)
