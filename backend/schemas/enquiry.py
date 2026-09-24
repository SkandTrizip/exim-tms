from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class EnquiryBase(BaseModel):
    enquiry_number: str
    client_name: str
    shipment_type: str
    client_scope: Optional[str] = None
    enquiry_received_date: Optional[date] = None
    stuffing_date: Optional[date] = None
    origin: str
    destination: str
    origin_port_code: Optional[str] = None
    destination_port_code: Optional[str] = None
    preferred_origin_port: Optional[str] = None
    preferred_destination_port: Optional[str] = None
    incoterm: Optional[str] = None
    mode_of_transport_origin: Optional[str] = None
    mode_of_transport_destination: Optional[str] = None
    container_type: Optional[str] = None
    container_count: Optional[int] = 0
    weight_measurement: Optional[str] = None
    weight_per_container: Optional[float] = 0.0
    air_cargo_details: Optional[str] = None
    commodity: Optional[str] = None
    hs_code: Optional[str] = None
    cargo_risk: Optional[str] = None
    cargo_risk_type: Optional[str] = None
    cargo_risk_detail: Optional[str] = None
    temperature: Optional[float] = None
    moisture: Optional[float] = None
    cargo_value: Optional[float] = 0.0
    cargo_value_currency: Optional[str] = "USD"
    customer_clearance_required: Optional[str] = None
    client_target_rate: Optional[float] = 0.0
    remarks: Optional[str] = None
    hbl_required: Optional[bool] = False
    delivery_agent: Optional[str] = None
    vessel: Optional[str] = None
    voyage_no: Optional[str] = None
    notify_party_address: Optional[str] = None
    notify_party_2_address: Optional[str] = None

    status: Optional[str] = "pending"
    stage: Optional[int] = 1
    is_void: Optional[bool] = False

class EnquiryCreate(EnquiryBase):
    pass

class Enquiry(EnquiryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
