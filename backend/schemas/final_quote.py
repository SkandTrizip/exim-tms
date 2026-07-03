from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


class FinalQuoteChargeBase(BaseModel):
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
    charge_sequence: int = 0


class FinalQuoteChargeCreate(FinalQuoteChargeBase):
    pass


class FinalQuoteCharge(FinalQuoteChargeBase):
    id: int
    container_id: int

    class Config:
        from_attributes = True


class FinalQuoteContainerBase(BaseModel):
    container_type: str
    container_sequence: int = 0


class FinalQuoteContainerCreate(FinalQuoteContainerBase):
    charges: List[FinalQuoteChargeCreate] = []


class FinalQuoteContainer(FinalQuoteContainerBase):
    id: int
    final_quote_id: int
    charges: List[FinalQuoteCharge] = []

    class Config:
        from_attributes = True


class FinalQuoteBase(BaseModel):
    quote_name: str
    place_of_receipt: Optional[str] = None
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    final_place_of_delivery: Optional[str] = None
    shipping_line: Optional[str] = None
    incoterm: Optional[str] = None
    rate_currency: str = "USD"
    transit_time_days: Optional[int] = None
    rate_validity_date: Optional[date] = None
    destination_free_days: Optional[int] = None
    total_origin_charges_inr: float = 0.0
    total_destination_charges_usd: float = 0.0
    final_quote_inr: float = 0.0


class FinalQuoteUpdate(BaseModel):
    total_origin_charges_inr: Optional[float] = None
    total_destination_charges_usd: Optional[float] = None
    final_quote_inr: Optional[float] = None
    remarks_reason: Optional[str] = None
    remarks_other: Optional[str] = None
    containers: Optional[List[FinalQuoteContainerCreate]] = None


class FinalQuote(FinalQuoteBase):
    id: int
    enquiry_id: int
    source_quote_id: int
    revision_remarks_reason: Optional[str] = None
    revision_remarks_other: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    containers: List[FinalQuoteContainer] = []

    class Config:
        from_attributes = True
