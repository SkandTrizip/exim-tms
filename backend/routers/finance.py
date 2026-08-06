from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.finance import ShippingPayment, OverheadPayment
from backend.models.shipment_status import ShipmentStatus
from backend.models.overhead import Overhead
from backend.models.payee import Payee
from backend.models.enquiry_economics import EnquiryEconomics
from backend.services.enquiry_economics_service import (
    sync_enquiry_economics,
    serialize_overhead_payment,
    get_ocean_freight_exchange_rate,
)
from pydantic import BaseModel
from typing import Optional, List, Union
from datetime import date, datetime
from backend.utils.logger import logger


def _resync_economics(db: Session, enquiry_id: int) -> None:
    """Refresh enquiry_economics after an overhead change; never break the request."""
    try:
        sync_enquiry_economics(db, enquiry_id, commit=True)
    except Exception:
        logger.exception("Failed to resync enquiry economics for enquiry %s", enquiry_id)

router = APIRouter(prefix="/finance", tags=["Finance"])

class ShippingPaymentCreate(BaseModel):
    enquiry_id: int
    # DB column is text[]; accept either a single UTR or a list for compatibility.
    utr_number: Union[str, List[str]]
    # DB column is date[]; accept either a single date or a list for compatibility.
    payment_date: Union[date, List[date]]
    amount: float
    currency: Optional[str] = "INR"
    description: Optional[str] = None
    payment_type: Optional[str] = "Main"

@router.post("/shipping-payment")
def record_shipping_payment(payment: ShippingPaymentCreate, db: Session = Depends(get_db)):
    utr_values = payment.utr_number if isinstance(payment.utr_number, list) else [payment.utr_number]
    payment_dates = payment.payment_date if isinstance(payment.payment_date, list) else [payment.payment_date]
    payload = payment.model_dump()
    payload["utr_number"] = utr_values
    payload["payment_date"] = payment_dates

    # Match existing row when any submitted UTR is already stored for this enquiry
    existing = None
    if utr_values:
        existing = (
            db.query(ShippingPayment)
            .filter(
                ShippingPayment.enquiry_id == payment.enquiry_id,
                ShippingPayment.utr_number.overlap(utr_values),
            )
            .first()
        )

    if existing:
        logger.info(
            "Updating existing shipping payment for enquiry %s (UTRs: %s)",
            payment.enquiry_id,
            ", ".join(utr_values),
        )
        existing.utr_number = utr_values
        existing.payment_date = payment_dates
        existing.amount = payment.amount
        existing.currency = payment.currency
        existing.description = payment.description
        existing.payment_type = payment.payment_type
    else:
        logger.info(
            "Recording new shipping payment for enquiry %s (UTRs: %s)",
            payment.enquiry_id,
            ", ".join(utr_values),
        )
        new_payment = ShippingPayment(**payload)
        db.add(new_payment)
    
    # Also update shipment status to reflect payment done (at least one main payment)
    status = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == payment.enquiry_id).first()
    if not status:
        status = ShipmentStatus(enquiry_id=payment.enquiry_id)
        db.add(status)
    
    # Mark shipping-line payment complete whenever a UTR is recorded.
    status.pay_line = datetime.now()
    
    db.commit()
    return {"message": "Payment recorded successfully"}

@router.get("/shipping-payment/{enquiry_id}")
def get_shipping_payments(enquiry_id: int, db: Session = Depends(get_db)):
    payments = db.query(ShippingPayment).filter(ShippingPayment.enquiry_id == enquiry_id).all()
    return payments


# ── Overhead payments (intermittent charges booked against a shipment) ─────────

class NewPayeeInline(BaseModel):
    payee_name: str
    payee_type: Optional[str] = "Company"
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    beneficiary_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    bank: Optional[str] = None
    bank_branch: Optional[str] = None


class OverheadPaymentCreate(BaseModel):
    enquiry_id: int
    overhead_id: Optional[int] = None
    overhead_name: Optional[str] = None
    # Who the overhead is paid/billed to: "shipping_line" or "payee"
    pay_to_type: Optional[str] = "payee"
    # Display name for the recipient (used when pay_to_type == "shipping_line").
    pay_to_name: Optional[str] = None
    # Economic treatment: "add_to_shipping_line" or "deduct_from_client"
    cost_impact: Optional[str] = "add_to_shipping_line"
    # Either reference an existing payee or supply a new one to create inline.
    payee_id: Optional[int] = None
    new_payee: Optional[NewPayeeInline] = None
    description: Optional[str] = None
    amount: float
    currency: Optional[str] = "INR"
    status: Optional[str] = "to_be_booked"
    utr_number: Optional[str] = None
    payment_date: Optional[date] = None
    created_by: Optional[str] = None


class OverheadPaymentBook(BaseModel):
    utr_number: Optional[str] = None
    payment_date: Optional[date] = None
    status: Optional[str] = "paid"  # booked | paid


def _resolve_payee(db: Session, payment: "OverheadPaymentCreate") -> "Payee | None":
    """Return an existing payee, creating one inline when new details are given."""
    if payment.new_payee and payment.new_payee.payee_name:
        existing = (
            db.query(Payee)
            .filter(Payee.payee_name == payment.new_payee.payee_name)
            .first()
        )
        if existing:
            return existing
        payee = Payee(
            **payment.new_payee.model_dump(exclude_none=True),
            status="pending",
            submitted_by=payment.created_by or "finance",
        )
        db.add(payee)
        db.flush()  # assign id without ending the transaction
        return payee
    if payment.payee_id:
        return db.query(Payee).filter(Payee.id == payment.payee_id).first()
    return None


@router.post("/overhead-payment")
def create_overhead_payment(payment: OverheadPaymentCreate, db: Session = Depends(get_db)):
    # Overheads can only be booked against an enquiry that already exists in
    # enquiry_economics, i.e. after its final quote has been submitted.
    economics = (
        db.query(EnquiryEconomics)
        .filter(EnquiryEconomics.enquiry_id == payment.enquiry_id)
        .first()
    )
    if economics is None:
        raise HTTPException(
            status_code=400,
            detail="Final quote must be submitted for this job before adding overheads.",
        )

    currency = (payment.currency or "INR").upper()
    if currency != "INR":
        roe = get_ocean_freight_exchange_rate(db, payment.enquiry_id)
        if roe is None or roe <= 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot book {currency} overhead — Ocean Freight exchange rate "
                    "not found on the final quote for this job."
                ),
            )

    overhead_name = payment.overhead_name
    if payment.overhead_id and not overhead_name:
        ov = db.query(Overhead).filter(Overhead.id == payment.overhead_id).first()
        overhead_name = ov.overhead_name if ov else None

    pay_to_type = payment.pay_to_type or "payee"
    if pay_to_type == "shipping_line":
        payee_id = None
        payee_name = payment.pay_to_name
    else:
        payee = _resolve_payee(db, payment)
        payee_id = payee.id if payee else None
        payee_name = payee.payee_name if payee else payment.pay_to_name

    record = OverheadPayment(
        enquiry_id=payment.enquiry_id,
        overhead_id=payment.overhead_id,
        overhead_name=overhead_name,
        pay_to_type=pay_to_type,
        cost_impact=payment.cost_impact or "add_to_shipping_line",
        payee_id=payee_id,
        payee_name=payee_name,
        description=payment.description,
        amount=payment.amount,
        currency=payment.currency or "INR",
        status=payment.status or "to_be_booked",
        utr_number=payment.utr_number,
        payment_date=payment.payment_date,
        created_by=payment.created_by,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(
        "Recorded overhead payment id=%s enquiry=%s overhead=%s payee=%s amount=%s impact=%s",
        record.id, record.enquiry_id, record.overhead_name, record.payee_name, record.amount, record.cost_impact,
    )
    _resync_economics(db, record.enquiry_id)
    return serialize_overhead_payment(db, record)


@router.get("/overhead-payment/{enquiry_id}")
def get_overhead_payments(enquiry_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(OverheadPayment)
        .filter(OverheadPayment.enquiry_id == enquiry_id)
        .order_by(OverheadPayment.created_at)
        .all()
    )
    return [serialize_overhead_payment(db, row) for row in rows]


@router.patch("/overhead-payment/{id}/book")
def book_overhead_payment(id: int, data: OverheadPaymentBook, db: Session = Depends(get_db)):
    record = db.query(OverheadPayment).filter(OverheadPayment.id == id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Overhead payment not found")
    if data.utr_number is not None:
        record.utr_number = data.utr_number
    if data.payment_date is not None:
        record.payment_date = data.payment_date
    record.status = data.status or "paid"
    db.commit()
    db.refresh(record)
    _resync_economics(db, record.enquiry_id)
    return serialize_overhead_payment(db, record)


@router.delete("/overhead-payment/{id}")
def delete_overhead_payment(id: int, db: Session = Depends(get_db)):
    record = db.query(OverheadPayment).filter(OverheadPayment.id == id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Overhead payment not found")
    enquiry_id = record.enquiry_id
    db.delete(record)
    db.commit()
    _resync_economics(db, enquiry_id)
    return {"message": "Overhead payment deleted"}
