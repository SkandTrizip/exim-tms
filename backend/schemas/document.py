from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ShipmentDocumentBase(BaseModel):
    enquiry_id: Optional[int] = None
    quote_id: Optional[int] = None
    document_type: str
    file_name: str
    file_size: int
    mime_type: str

class ShipmentDocumentCreate(ShipmentDocumentBase):
    file_path: str

class ShipmentDocument(ShipmentDocumentBase):
    id: int
    file_path: str
    created_at: datetime

    class Config:
        from_attributes = True
