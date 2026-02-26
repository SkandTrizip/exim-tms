from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime

class ClientOrigin(Base):
    __tablename__ = "client_origin"

    id = Column(Integer, primary_key=True, index=True)
    group_client = Column(String)
    unique_client_name = Column(String, unique=True, index=True)
    office_location = Column(String)
    office_address = Column(String)
    gst_no = Column(String)
    gst_address = Column(String)
    country = Column(String)
    pin_code = Column(String)
    
    # Primary Contact
    contact_person = Column(String)
    contact_no = Column(String)
    email_id = Column(String)
    
    # Logistics Contact
    contact_person_logistics = Column(String)
    contact_no_logistics = Column(String)
    email_id_logistics = Column(String)
    
    # Finance Contact
    contact_person_finance = Column(String)
    contact_no_finance = Column(String)
    email_id_finance = Column(String)
    
    commodity = Column(String)
    sales_branch = Column(String)
    sales_person = Column(String)
    cs_name = Column(String)
    
    created_on = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationship with branches
    branches = relationship("ClientMaster", back_populates="origin")
