from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.finance import ShippingPayment
from backend.models.shipment_status import ShipmentStatus
from pydantic import BaseModel
from typing import Optional, List, Union
from datetime import date, datetime
from backend.utils.logger import logger

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
