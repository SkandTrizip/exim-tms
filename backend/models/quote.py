from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Text
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime

class Quote(Base):
    """
    Main quote/pricing sheet for an enquiry.
    One enquiry can have multiple quotes (different shipping lines, routes, etc.)
    """
    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Quote identification
    quote_name = Column(String, nullable=False)  # e.g., "Quote 1", "Maersk Quote"
    quote_number = Column(String, unique=True, index=True)  # Auto-generated unique quote number
    
    # Route information
    place_of_receipt = Column(String)  # POR
    port_of_loading = Column(String)   # POL
    port_of_discharge = Column(String) # POD
    final_place_of_delivery = Column(String)  # FPOD
    
    # Shipping details
    shipping_line = Column(String)
    incoterm = Column(String)
    rate_currency = Column(String, default="USD")
    transit_time_days = Column(Integer)
    rate_validity_date = Column(Date)
    destination_free_days = Column(Integer)
    
    # Totals (calculated from charges)
    total_origin_charges_inr = Column(Float, default=0.0)
    total_destination_charges_usd = Column(Float, default=0.0)
    final_quote_inr = Column(Float, default=0.0)
    
    # Status and metadata
    status = Column(String, default="draft")  # draft, sent, accepted, rejected
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relationships
    containers = relationship("QuoteContainer", back_populates="quote", cascade="all, delete-orphan")


class QuoteContainer(Base):
    """
    Container-specific pricing within a quote.
    One quote can have multiple container types with different rates.
    """
    __tablename__ = "quote_containers"

    id = Column(Integer, primary_key=True, index=True)
    quote_id = Column(Integer, ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)  # Direct link to enquiry
    
    # Container details
    container_type = Column(String, nullable=False)  # e.g., "20'STD", "40'HC"
    container_sequence = Column(Integer, default=0)  # Order in the quote
    
    # Relationships
    quote = relationship("Quote", back_populates="containers")
    charges = relationship("QuoteCharge", back_populates="container", cascade="all, delete-orphan")


class QuoteCharge(Base):
    """
    Individual charge line items for each container in a quote.
    Examples: Ocean Freight, THC, BL Fee, etc.
    """
    __tablename__ = "quote_charges"

    id = Column(Integer, primary_key=True, index=True)
    container_id = Column(Integer, ForeignKey("quote_containers.id", ondelete="CASCADE"), nullable=False, index=True)
    quote_id = Column(Integer, ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)  # Direct link to quote
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)  # Direct link to enquiry
    
    # Charge details
    charge_description = Column(String, nullable=False)  # e.g., "Ocean Freight", "BL Fee"
    account_type = Column(String)  # "On Your Account", "On Client Account", etc.
    currency = Column(String, default="USD")  # USD, INR, EUR
    charged_on = Column(String)  # "Quantity", "Per BL", "Lumpsum"
    
    # Pricing
    quantity = Column(Float, default=1.0)
    rate = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)  # quantity * rate (Shipping Line cost)
    
    # Exchange rate and conversion
    exchange_rate = Column(Float, default=1.0)  # For USD to INR conversion
    final_inr_amount = Column(Float, default=0.0)  # total_amount * exchange_rate (Shipping Line total INR)
    
    # Vendor Rate: what the company charges the client (editable, not fixed)
    vendor_rate = Column(Float, default=0.0)
    
    # Sequence for ordering
    charge_sequence = Column(Integer, default=0)
    
    # Relationships
    container = relationship("QuoteContainer", back_populates="charges")
