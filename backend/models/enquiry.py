from sqlalchemy import Column, Integer, String, DateTime, Float, Date, Text, Boolean
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime

class Enquiry(Base):
    __tablename__ = "enquiries"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_number = Column(String, index=True)
    client_name = Column(String, index=True)
    shipment_type = Column(String)
    client_scope = Column(String)
    enquiry_received_date = Column(Date)
    stuffing_date = Column(Date)
    origin = Column(String)
    destination = Column(String)
    origin_port_code = Column(String)
    destination_port_code = Column(String)
    preferred_origin_port = Column(String)
    preferred_destination_port = Column(String)
    incoterm = Column(String)
    mode_of_transport_origin = Column(String)
    mode_of_transport_destination = Column(String)
    container_type = Column(String)
    container_count = Column(Integer)
    weight_measurement = Column(String)
    weight_per_container = Column(Float)
    commodity = Column(String)
    hs_code = Column(String)
    cargo_risk = Column(String)
    cargo_risk_type = Column(String)  # The "Type" dropdown
    cargo_risk_detail = Column(String) # The sub-category or UN Code text
    temperature = Column(Float)
    moisture = Column(Float)
    cargo_value = Column(Float)
    cargo_value_currency = Column(String)
    customer_clearance_required = Column(String)
    client_target_rate = Column(Float)
    remarks = Column(Text)
    status = Column(String, default="pending")
    stage = Column(Integer, default=1)
    is_void = Column(Boolean, default=False, nullable=False, server_default='false')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships with cascading deletes
    quotes = relationship("Quote", backref="enquiry", cascade="all, delete-orphan")
    shipment_status = relationship("ShipmentStatus", backref="enquiry", cascade="all, delete-orphan", uselist=False)
    shipping_payments = relationship("ShippingPayment", backref="enquiry", cascade="all, delete-orphan")
    documents = relationship("ShipmentDocument", backref="enquiry", cascade="all, delete-orphan")
    invoices = relationship("Invoice", backref="enquiry", cascade="all, delete-orphan")


