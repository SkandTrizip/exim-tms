from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.finance import ShippingPayment
from backend.models.shipment_status import ShipmentStatus
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from backend.utils.logger import logger

router = APIRouter(prefix="/finance", tags=["Finance"])

class ShippingPaymentCreate(BaseModel):
    enquiry_id: int
    utr_number: str
    payment_date: date
    amount: float
    currency: Optional[str] = "INR"
    description: Optional[str] = None
    payment_type: Optional[str] = "Main"

@router.post("/shipping-payment")
def record_shipping_payment(payment: ShippingPaymentCreate, db: Session = Depends(get_db)):
    # Check if this specific payment (by UTR) already exists
    existing = db.query(ShippingPayment).filter(
        ShippingPayment.enquiry_id == payment.enquiry_id,
        ShippingPayment.utr_number == payment.utr_number
    ).first()
    
    if existing:
        logger.info(f"Updating existing payment UTR {payment.utr_number} for enquiry {payment.enquiry_id}")
        # Update existing
        existing.payment_date = payment.payment_date
        existing.amount = payment.amount
        existing.currency = payment.currency
        existing.description = payment.description
        existing.payment_type = payment.payment_type
    else:
        logger.info(f"Recording new payment UTR {payment.utr_number} for enquiry {payment.enquiry_id}")
        new_payment = ShippingPayment(**payment.model_dump())
        db.add(new_payment)
    
    # Also update shipment status to reflect payment done (at least one main payment)
    status = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == payment.enquiry_id).first()
    if not status:
        status = ShipmentStatus(enquiry_id=payment.enquiry_id)
        db.add(status)
    
    if payment.payment_type == "Main":
        status.pay_line = datetime.now()
    
    db.commit()
    return {"message": "Payment recorded successfully"}

@router.get("/shipping-payment/{enquiry_id}")
def get_shipping_payments(enquiry_id: int, db: Session = Depends(get_db)):
    payments = db.query(ShippingPayment).filter(ShippingPayment.enquiry_id == enquiry_id).all()
    return payments
