from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ClientOriginBase(BaseModel):
    group_client: Optional[str] = None
    unique_client_name: Optional[str] = None
    office_location: Optional[str] = None
    office_address: Optional[str] = None
    gst_no: Optional[str] = None
    gst_address: Optional[str] = None
    country: Optional[str] = None
    pin_code: Optional[str] = None
    contact_person: Optional[str] = None
    contact_no: Optional[str] = None
    email_id: Optional[str] = None
    contact_person_logistics: Optional[str] = None
    contact_no_logistics: Optional[str] = None
    email_id_logistics: Optional[str] = None
    contact_person_finance: Optional[str] = None
    contact_no_finance: Optional[str] = None
    email_id_finance: Optional[str] = None
    commodity: Optional[str] = None
    sales_branch: Optional[str] = None
    sales_person: Optional[str] = None
    cs_name: Optional[str] = None

class ClientOriginCreate(ClientOriginBase):
    pass

class ClientOriginUpdate(ClientOriginBase):
    pass

class ClientOrigin(ClientOriginBase):
    id: int
    created_on: Optional[datetime] = None

    class Config:
        from_attributes = True
