from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime

class ClientMaster(Base):
    __tablename__ = "client_master"

    id = Column(Integer, primary_key=True, index=True)
    origin_id = Column(Integer, ForeignKey("client_origin.id"))
    client_code = Column(String, unique=True, index=True)
    client_name = Column(String, index=True)
    gst_name = Column(String)
    gst_no = Column(String)
    pan_no = Column(String)
    iec_code = Column(String)
    co_registration_type = Column(String) # Fixed: Proprietorship, Private Ltd, LLP
    office_location = Column(String)
    office_address = Column(String)
    country = Column(String)
    pin_code = Column(String)
    contact_person = Column(String)
    contact_no = Column(String)
    email_id = Column(String)
    client_type_category = Column(String) # Fixed: Enterprise, MSME
    business_nature = Column(String) # Fixed: Manufacturing, Trading
    industry_type = Column(String) # Fixed: Pharma, Electronics
    shipment_type = Column(String) # Fixed: FCL, LCL, AIR
    contract_type = Column(String) # Fixed: Fixed, NA
    billing_method = Column(String) # Fixed: FCM, RCM
    gst_percent = Column(String) # Fixed: 18%, 5%
    billing_type = Column(String) # Fixed: Neft, Cheque
    payment_terms = Column(String) # Fixed: Against BL, Credit
    credit_amount = Column(Float, nullable=True)
    credit_period = Column(Integer, nullable=True) # Days
    
    # Tracking
    created_by = Column(String)
    created_on = Column(DateTime, default=datetime.datetime.utcnow)
    modified_by = Column(String)
    modified_on = Column(DateTime, onupdate=datetime.datetime.utcnow)

    # Verification
    status = Column(String, default="pending")
    submitted_by = Column(String)
    verified_by = Column(String)
    verified_at = Column(DateTime)
    
    # Secondary Contacts
    contact_person_logistics = Column(String)
    contact_no_logistics = Column(String)
    email_id_logistics = Column(String)
    contact_person_finance = Column(String)
    contact_no_finance = Column(String)
    email_id_finance = Column(String)
    
    # Sales/CS
    sales_branch = Column(String)
    sales_person = Column(String)
    cs_name = Column(String)

    # Relationship with origin
    origin = relationship("ClientOrigin", back_populates="branches")
