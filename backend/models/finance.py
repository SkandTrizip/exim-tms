from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Date
from sqlalchemy.dialects.postgresql import ARRAY
from backend.database import Base
import datetime

class ShippingPayment(Base):
    __tablename__ = "shipping_payments"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"))
    # Postgres: text[] (supports multiple UTRs per payment row)
    utr_number = Column(ARRAY(String))
    # Postgres: date[] (supports multiple payment dates per UTR row)
    payment_date = Column(ARRAY(Date))
    amount = Column(Float)
    currency = Column(String, default="INR")
    description = Column(String, nullable=True)
    payment_type = Column(String, default="Main") # "Main" or "Additional"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class OverheadPayment(Base):
    """
    An intermittent overhead booked against a shipment as a payable line item.
    Starts life as 'to_be_booked' and becomes 'booked'/'paid' once a UTR is
    recorded. Overhead + payee are linked to their masters, with name snapshots
    kept so historic records survive master edits.
    """
    __tablename__ = "overhead_payments"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), index=True)

    overhead_id   = Column(Integer, ForeignKey("overheads.id", ondelete="SET NULL"), nullable=True)
    overhead_name = Column(String)   # snapshot of overhead at booking time

    payee_id   = Column(Integer, ForeignKey("payees.id", ondelete="SET NULL"), nullable=True)
    payee_name = Column(String)      # snapshot of payee/recipient at booking time
    # Who the overhead is billed/paid to: "shipping_line" or "payee"
    pay_to_type = Column(String, default="payee")
    # How the overhead affects economics:
    #   "add_to_shipping_line" -> increases shipping-line cost
    #   "deduct_from_client"   -> deducted from client amount
    cost_impact = Column(String, default="add_to_shipping_line")

    description = Column(String, nullable=True)
    amount   = Column(Float)
    currency = Column(String, default="INR")

    # to_be_booked -> booked -> paid
    status     = Column(String, default="to_be_booked")
    utr_number = Column(String, nullable=True)
    payment_date = Column(Date, nullable=True)

    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    modified_at = Column(DateTime, onupdate=datetime.datetime.utcnow)
