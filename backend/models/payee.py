from sqlalchemy import Column, Integer, String, DateTime
from backend.database import Base
import datetime

class Payee(Base):
    """
    Master of parties/persons a payment can be made against (vendors,
    transporters, CHAs, individuals). Holds contact + bank/beneficiary
    details so an overhead payment can be booked and remitted.
    """
    __tablename__ = "payees"

    id = Column(Integer, primary_key=True, index=True)

    # Identity
    payee_name  = Column(String, unique=True, index=True)
    payee_type  = Column(String, default="Company")   # Company | Individual
    office_location = Column(String)
    address     = Column(String)

    # Tax / Legal
    gst_number = Column(String)
    pan_number = Column(String)

    # Contact
    contact_person = Column(String)
    contact_number = Column(String)
    email          = Column(String)

    # Bank / Beneficiary Details
    beneficiary_name = Column(String)
    account_number   = Column(String)
    ifsc_code        = Column(String)
    bank             = Column(String)
    bank_branch      = Column(String)

    # Verification workflow (mirrors other masters)
    status       = Column(String, default="pending")  # pending | verified | rejected
    submitted_by = Column(String)
    verified_by  = Column(String)
    verified_at  = Column(DateTime)

    created_at  = Column(DateTime, default=datetime.datetime.utcnow)
    modified_at = Column(DateTime, onupdate=datetime.datetime.utcnow)
