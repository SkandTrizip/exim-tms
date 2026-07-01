from typing import List, Optional
from datetime import datetime, date
from pydantic import BaseModel


class SearchResultItem(BaseModel):
    enquiry_id: int
    enquiry_number: str
    client_name: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    shipping_line: Optional[str] = None
    master_number: Optional[str] = None
    si_number: Optional[str] = None
    container_number: Optional[str] = None
    invoice_number: Optional[str] = None
    stage: int = 1
    status: str = "pending"
    is_void: bool = False
    match_labels: List[str] = []


class SearchResponse(BaseModel):
    query: str
    total: int
    results: List[SearchResultItem]


class ShipmentDocumentItem(BaseModel):
    id: int
    document_type: Optional[str] = None
    file_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ShipmentInvoiceItem(BaseModel):
    id: int
    invoice_number: str
    customer_invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    payment_due_date: Optional[date] = None
    is_paid: bool = False
    payment_reference: Optional[str] = None
    received_amount: Optional[float] = None

    class Config:
        from_attributes = True


class ShipmentQuoteSummary(BaseModel):
    id: int
    quote_name: Optional[str] = None
    quote_number: Optional[str] = None
    shipping_line: Optional[str] = None
    status: Optional[str] = None
    final_quote_inr: Optional[float] = None
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    rate_validity_date: Optional[date] = None

    class Config:
        from_attributes = True


class ShipmentStatusDetail(BaseModel):
    booking_confirmed: Optional[datetime] = None
    si_submitted: Optional[datetime] = None
    bl_received: Optional[datetime] = None
    sob: Optional[datetime] = None
    shipping_invoice: Optional[datetime] = None
    pay_line: Optional[datetime] = None
    inv_raised: Optional[datetime] = None
    pay_client: Optional[datetime] = None
    si_number: Optional[str] = None
    master_number: Optional[str] = None
    container_number: Optional[str] = None
    vessel: Optional[str] = None
    voyage: Optional[str] = None
    port_of_origin: Optional[str] = None
    final_destination: Optional[str] = None
    etd: Optional[datetime] = None
    eta: Optional[datetime] = None
    utr_number: Optional[str] = None

    class Config:
        from_attributes = True


class ShipmentDetailResponse(BaseModel):
    enquiry: dict
    status: Optional[ShipmentStatusDetail] = None
    quotes: List[ShipmentQuoteSummary] = []
    accepted_quote: Optional[ShipmentQuoteSummary] = None
    documents: List[ShipmentDocumentItem] = []
    invoices: List[ShipmentInvoiceItem] = []
