from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from backend.database import Base
import datetime

class ShipmentStatus(Base):
    __tablename__ = "shipment_statuses"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), unique=True)
    
    # Operational Checklist Milestones
    booking_confirmed = Column(DateTime)
    booking_placed = Column(DateTime)
    booking_finalized = Column(DateTime)
    container_picked = Column(DateTime)
    stuffing_done = Column(DateTime)
    container_gated = Column(DateTime)
    draft_si = Column(DateTime)
    si_submitted = Column(DateTime)
    form13 = Column(DateTime)
    shipping_bill = Column(DateTime)
    sob = Column(DateTime)
    shipping_invoice = Column(DateTime)
    bl_received = Column(DateTime)
    origin_cert = Column(DateTime)
    customs_decl = Column(DateTime)
    insurance_cert = Column(DateTime)
    
    # Metadata for SI and BL
    si_number = Column(String)
    consignee = Column(String)
    port_of_origin = Column(String)
    final_destination = Column(String)
    vessel = Column(String)
    voyage = Column(String)
    etd = Column(DateTime)
    eta = Column(DateTime)
    master_number = Column(String)
    
    # Finance Statuses
    pay_line = Column(DateTime)
    inv_raised = Column(DateTime)
    pay_client = Column(DateTime)
    
    # New Payment Details
    utr_number = Column(String)
    payment_date = Column(DateTime)
    payment_amount = Column(Integer)
    
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
