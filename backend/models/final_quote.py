from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Text
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime


class FinalQuote(Base):
    """
    Post-SI revised quote for an accepted source quote.
    Initial/confirmed rates remain in quotes + quote_containers + quote_charges (read-only).
    """
    __tablename__ = "final_quotes"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)
    source_quote_id = Column(
        Integer,
        ForeignKey("quotes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    quote_name = Column(String, nullable=False)
    place_of_receipt = Column(String)
    port_of_loading = Column(String)
    port_of_discharge = Column(String)
    final_place_of_delivery = Column(String)
    shipping_line = Column(String)
    incoterm = Column(String)
    rate_currency = Column(String, default="USD")
    transit_time_days = Column(Integer)
    rate_validity_date = Column(Date)
    destination_free_days = Column(Integer)

    total_origin_charges_inr = Column(Float, default=0.0)
    total_destination_charges_usd = Column(Float, default=0.0)
    final_quote_inr = Column(Float, default=0.0)

    revision_remarks_reason = Column(String, nullable=True)
    revision_remarks_other = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    containers = relationship(
        "FinalQuoteContainer",
        back_populates="final_quote",
        cascade="all, delete-orphan",
        order_by="FinalQuoteContainer.container_sequence, FinalQuoteContainer.id",
    )


class FinalQuoteContainer(Base):
    __tablename__ = "final_quote_containers"

    id = Column(Integer, primary_key=True, index=True)
    final_quote_id = Column(Integer, ForeignKey("final_quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)
    container_type = Column(String, nullable=False)
    container_sequence = Column(Integer, default=0)

    final_quote = relationship("FinalQuote", back_populates="containers")
    charges = relationship(
        "FinalQuoteCharge",
        back_populates="container",
        cascade="all, delete-orphan",
        order_by="FinalQuoteCharge.charge_sequence, FinalQuoteCharge.id",
    )


class FinalQuoteCharge(Base):
    __tablename__ = "final_quote_charges"

    id = Column(Integer, primary_key=True, index=True)
    container_id = Column(Integer, ForeignKey("final_quote_containers.id", ondelete="CASCADE"), nullable=False, index=True)
    final_quote_id = Column(Integer, ForeignKey("final_quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False, index=True)

    charge_description = Column(String, nullable=False)
    account_type = Column(String)
    currency = Column(String, default="USD")
    charged_on = Column(String)
    quantity = Column(Float, default=1.0)
    rate = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    exchange_rate = Column(Float, default=1.0)
    final_inr_amount = Column(Float, default=0.0)
    vendor_rate = Column(Float, default=0.0)
    vendor_exchange_rate = Column(Float, default=1.0)
    charge_sequence = Column(Integer, default=0)

    container = relationship("FinalQuoteContainer", back_populates="charges")
