from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class OverheadBase(BaseModel):
    overhead_name:    Optional[str] = None
    category:         Optional[str] = None
    description:      Optional[str] = None
    default_currency: Optional[str] = "INR"
    default_amount:   Optional[float] = None
    hsn_sac:          Optional[str] = None
    gst_rate:         Optional[float] = None
    gst_applicable:   Optional[bool] = False
    status:           Optional[str] = "pending"
    submitted_by:     Optional[str] = None

class OverheadCreate(OverheadBase):
    pass

class OverheadUpdate(OverheadBase):
    pass

class Overhead(OverheadBase):
    id:           int
    status:       Optional[str] = "pending"
    submitted_by: Optional[str] = None
    verified_by:  Optional[str] = None
    verified_at:  Optional[datetime] = None
    created_at:   Optional[datetime] = None
    modified_at:  Optional[datetime] = None

    class Config:
        from_attributes = True
