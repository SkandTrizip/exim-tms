from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime

# ==========================================
# Quote Charge Schemas
# ==========================================

class QuoteChargeBase(BaseModel):
    charge_description: str
    account_type: Optional[str] = "On Your Account"
    currency: str = "USD"
    charged_on: str = "Per Container"
    quantity: float = Field(1.0, ge=0)
    rate: float = Field(0.0, ge=0)
    total_amount: float = Field(0.0, ge=0)
    exchange_rate: float = Field(1.0, ge=0)
    final_inr_amount: float = Field(0.0, ge=0)
    vendor_rate: float = Field(0.0, ge=0)
    vendor_exchange_rate: float = Field(1.0, ge=0)
    charge_sequence: int = 0

class QuoteChargeCreate(QuoteChargeBase):
    pass

class QuoteCharge(QuoteChargeBase):
    id: int
    container_id: int

    class Config:
        from_attributes = True


# ==========================================
# Quote Container Schemas
# ==========================================

class QuoteContainerBase(BaseModel):
    container_type: str
    container_sequence: int = 0

class QuoteContainerCreate(QuoteContainerBase):
    charges: List[QuoteChargeCreate] = []

class QuoteContainer(QuoteContainerBase):
    id: int
    quote_id: int
    charges: List[QuoteCharge] = []

    class Config:
        from_attributes = True


# ==========================================
# Quote Schemas
# ==========================================

class QuoteBase(BaseModel):
    quote_name: str = Field(..., description="Name of the quote, e.g., 'Quote 1', 'Maersk Quote'")
    
    # Route information
    place_of_receipt: Optional[str] = None
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    final_place_of_delivery: Optional[str] = None
    
    # Shipping details
    shipping_line: Optional[str] = None
    incoterm: Optional[str] = None
    rate_currency: str = "USD"
    transit_time_days: Optional[int] = None
    rate_validity_date: Optional[date] = None
    destination_free_days: Optional[int] = None
    
    # Totals
    total_origin_charges_inr: float = 0.0
    total_destination_charges_usd: float = 0.0
    final_quote_inr: float = 0.0
    
    # Status
    status: str = "draft"

class QuoteCreate(QuoteBase):
    enquiry_id: int
    containers: List[QuoteContainerCreate] = []

class QuoteStatusUpdate(BaseModel):
    remarks_reason: Optional[str] = None
    remarks_other: Optional[str] = None


class QuoteUpdate(BaseModel):
    quote_name: Optional[str] = None
    place_of_receipt: Optional[str] = None
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    final_place_of_delivery: Optional[str] = None
    shipping_line: Optional[str] = None
    incoterm: Optional[str] = None
    rate_currency: Optional[str] = None
    transit_time_days: Optional[int] = None
    rate_validity_date: Optional[date] = None
    destination_free_days: Optional[int] = None
    total_origin_charges_inr: Optional[float] = None
    total_destination_charges_usd: Optional[float] = None
    final_quote_inr: Optional[float] = None
    status: Optional[str] = None
    containers: Optional[List[QuoteContainerCreate]] = None

class Quote(QuoteBase):
    id: int
    enquiry_id: int
    quote_number: str
    initial_quote_snapshot: Optional[str] = None
    final_quote_snapshot: Optional[str] = None
    accepted_remarks_reason: Optional[str] = None
    accepted_remarks_other: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    containers: List[QuoteContainer] = []

    class Config:
        from_attributes = True


# ==========================================
# Response Schemas
# ==========================================

class QuoteListResponse(BaseModel):
    """Response for listing quotes"""
    quotes: List[Quote]
    total: int

class QuoteDetailResponse(BaseModel):
    """Response for single quote with full details"""
    quote: Quote
    enquiry_number: Optional[str] = None
    client_name: Optional[str] = None
