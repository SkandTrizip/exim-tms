from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ShippingLineBase(BaseModel):
    shipping_line_name:          Optional[str] = None
    office_location:             Optional[str] = None
    office_address:              Optional[str] = None
    gst_number:                  Optional[str] = None
    pan_number:                  Optional[str] = None
    primary_contact_person:      Optional[str] = None
    primary_contact_number:      Optional[str] = None
    primary_poc_designation:     Optional[str] = None
    secondary_contact_person:    Optional[str] = None
    secondary_contact_number:    Optional[str] = None
    secondary_email:             Optional[str] = None
    beneficiary_name:            Optional[str] = None
    account_number:              Optional[str] = None
    ifsc_code:                   Optional[str] = None
    bank:                        Optional[str] = None
    bank_branch:                 Optional[str] = None
    gst_doc_path:                Optional[str] = None
    pan_doc_path:                Optional[str] = None
    cheque_doc_path:             Optional[str] = None
    tds_doc_path:                Optional[str] = None
    status:                      Optional[str] = "pending"
    submitted_by:                Optional[str] = None

class ShippingLineCreate(ShippingLineBase):
    pass

class ShippingLineUpdate(ShippingLineBase):
    pass

class ShippingLine(ShippingLineBase):
    id:           int
    status:       Optional[str] = "pending"
    submitted_by: Optional[str] = None
    verified_by:  Optional[str] = None
    verified_at:  Optional[datetime] = None
    created_at:   Optional[datetime] = None
    modified_at:  Optional[datetime] = None

    class Config:
        from_attributes = True
