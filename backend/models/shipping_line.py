from sqlalchemy import Column, Integer, String, DateTime
from backend.database import Base
import datetime

class ShippingLine(Base):
    __tablename__ = "shipping_lines"

    id = Column(Integer, primary_key=True, index=True)

    # Identity
    shipping_line_name = Column(String, unique=True, index=True)
    office_location    = Column(String)
    office_address     = Column(String)

    # Tax / Legal
    gst_number = Column(String)
    pan_number = Column(String)

    # Primary Contact
    primary_contact_person      = Column(String)
    primary_contact_number      = Column(String)
    primary_poc_designation     = Column(String)

    # Secondary Contact
    secondary_contact_person    = Column(String)
    secondary_contact_number    = Column(String)
    secondary_email             = Column(String)

    # Bank Details
    beneficiary_name  = Column(String)
    account_number    = Column(String)
    ifsc_code         = Column(String)
    bank              = Column(String)
    bank_branch       = Column(String)

    # Uploaded document paths
    gst_doc_path       = Column(String)   # Upload GST
    pan_doc_path       = Column(String)   # Upload PAN
    cheque_doc_path    = Column(String)   # Upload Cheque Copy
    tds_doc_path       = Column(String)   # Upload TDS Certificate

    # Verification workflow
    status       = Column(String, default="pending")  # pending | verified | rejected
    submitted_by = Column(String)   # username of who submitted
    verified_by  = Column(String)   # username of admin who verified
    verified_at  = Column(DateTime)

    created_at  = Column(DateTime, default=datetime.datetime.utcnow)
    modified_at = Column(DateTime, onupdate=datetime.datetime.utcnow)
