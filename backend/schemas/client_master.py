from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ClientMasterBase(BaseModel):
    origin_id: Optional[int] = None
    client_code: Optional[str] = None
    client_name: Optional[str] = None
    gst_name: Optional[str] = None
    gst_no: Optional[str] = None
    pan_no: Optional[str] = None
    iec_code: Optional[str] = None
    co_registration_type: Optional[str] = None
    office_location: Optional[str] = None
    office_address: Optional[str] = None
    country: Optional[str] = None
    pin_code: Optional[str] = None
    contact_person: Optional[str] = None
    contact_no: Optional[str] = None
    email_id: Optional[str] = None
    client_type_category: Optional[str] = None
    business_nature: Optional[str] = None
    industry_type: Optional[str] = None
    shipment_type: Optional[str] = None
    contract_type: Optional[str] = None
    billing_method: Optional[str] = None
    gst_percent: Optional[str] = None
    billing_type: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_amount: Optional[float] = None
    credit_period: Optional[int] = None
    contact_person_logistics: Optional[str] = None
    contact_no_logistics: Optional[str] = None
    email_id_logistics: Optional[str] = None
    contact_person_finance: Optional[str] = None
    contact_no_finance: Optional[str] = None
    email_id_finance: Optional[str] = None
    sales_branch: Optional[str] = None
    sales_person: Optional[str] = None
    cs_name: Optional[str] = None
    created_by: Optional[str] = None
    status: Optional[str] = "pending"
    submitted_by: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None

class ClientMasterCreate(ClientMasterBase):
    pass

class ClientMasterUpdate(ClientMasterBase):
    pass

class ClientMaster(ClientMasterBase):
    id: int
    status: Optional[str] = "pending"
    submitted_by: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    created_on: Optional[datetime] = None
    modified_on: Optional[datetime] = None

    class Config:
        from_attributes = True
