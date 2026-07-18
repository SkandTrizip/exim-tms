from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class PayeeBase(BaseModel):
    payee_name:       Optional[str] = None
    payee_type:       Optional[str] = "Company"
    office_location:  Optional[str] = None
    address:          Optional[str] = None
    gst_number:       Optional[str] = None
    pan_number:       Optional[str] = None
    contact_person:   Optional[str] = None
    contact_number:   Optional[str] = None
    email:            Optional[str] = None
    beneficiary_name: Optional[str] = None
    account_number:   Optional[str] = None
    ifsc_code:        Optional[str] = None
    bank:             Optional[str] = None
    bank_branch:      Optional[str] = None
    status:           Optional[str] = "pending"
    submitted_by:     Optional[str] = None

class PayeeCreate(PayeeBase):
    pass

class PayeeUpdate(PayeeBase):
    pass

class Payee(PayeeBase):
    id:           int
    status:       Optional[str] = "pending"
    submitted_by: Optional[str] = None
    verified_by:  Optional[str] = None
    verified_at:  Optional[datetime] = None
    created_at:   Optional[datetime] = None
    modified_at:  Optional[datetime] = None

    class Config:
        from_attributes = True
