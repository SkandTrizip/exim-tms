from pydantic import BaseModel
from typing import Optional

class PortCodeBase(BaseModel):
    unlocode: str
    name: str
    status: Optional[str] = None
    date: Optional[int] = None
    coordinates: Optional[str] = None

class PortCode(PortCodeBase):
    class Config:
        from_attributes = True
