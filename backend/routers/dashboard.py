from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from backend.database import get_db
from backend.models.enquiry import Enquiry
from backend.models.quote import Quote
from backend.models.document import ShipmentDocument
from backend.utils.logger import logger

router = APIRouter()

def _count_or_zero(db, label: str, query_fn):
    """Run a count query; log and return 0 if the DB schema is out of sync."""
    try:
        return query_fn()
    except Exception as e:
        logger.error(f"Dashboard stat '{label}' failed: {e}")
        db.rollback()
        return 0


@router.get("/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Get dashboard statistics:
    1. Total Enquiry
    2. Pending at Pricing (No 'sent' or 'accepted' quotes)
    3. Pending for Client Confirmation (Has 'sent' quote but no 'accepted' quote)
    4. Booking Secured (Documents uploaded)
    """
    from backend.models.shipment_status import ShipmentStatus

    # 1. Total Enquiry (exclude voided sales from overview counts)
    total_enquiries = _count_or_zero(
        db,
        "total_enquiries",
        lambda: db.query(Enquiry).filter(Enquiry.is_void == False).count(),
    )

    active_enquiry = Enquiry.is_void == False

    # 2. Pending at Pricing — no quotes yet
    pending_at_pricing = _count_or_zero(
        db,
        "pending_at_pricing",
        lambda: db.query(Enquiry).outerjoin(Quote).filter(active_enquiry, Quote.id == None).count(),
    )

    enquiries_with_quotes = db.query(Quote.enquiry_id).distinct()
    enquiries_accepted = db.query(Quote.enquiry_id).filter(Quote.status == 'accepted').distinct()

    # 3. Pending for Client Confirmation
    pending_confirmation = _count_or_zero(
        db,
        "pending_confirmation",
        lambda: db.query(Enquiry)
        .filter(active_enquiry)
        .filter(Enquiry.id.in_(enquiries_with_quotes))
        .filter(Enquiry.id.notin_(enquiries_accepted))
        .count(),
    )

    def _ops_pending(milestone_col):
        return lambda: db.query(Enquiry).outerjoin(ShipmentStatus).filter(
            active_enquiry,
            Enquiry.stage >= 3,
            milestone_col == None,
        ).count()

    booking_pending = _count_or_zero(db, "booking_pending", _ops_pending(ShipmentStatus.booking_confirmed))
    si_pending = _count_or_zero(db, "si_pending", _ops_pending(ShipmentStatus.si_submitted))
    bl_pending = _count_or_zero(db, "bl_pending", _ops_pending(ShipmentStatus.bl_received))
    sob_pending = _count_or_zero(db, "sob_pending", _ops_pending(ShipmentStatus.sob))

    try:
        from backend.models.invoice import Invoice
        invoices_raised = db.query(Invoice).count()
    except Exception as e:
        logger.error(f"Error querying invoices_raised: {e}")
        invoices_raised = 0
    
    payment_pending = _count_or_zero(
        db,
        "payment_pending",
        lambda: db.query(Enquiry).outerjoin(ShipmentStatus).filter(
            active_enquiry,
            Enquiry.stage >= 3,
            ShipmentStatus.inv_raised != None,
            ShipmentStatus.pay_client == None,
        ).count(),
    )

    from backend.models.finance import ShippingPayment
    payments_made = db.query(ShippingPayment).count()

    try:
        received_payments = db.query(Invoice).filter(Invoice.is_paid == True).count()
    except Exception as e:
        logger.error(f"Error querying received_payments: {e}")
        received_payments = 0

    return {
        "total_enquiries": total_enquiries,
        "pending_at_pricing": pending_at_pricing,
        "pending_client_confirmation": pending_confirmation,
        "booking_pending": booking_pending,
        "si_pending": si_pending,
        "bl_pending": bl_pending,
        "sob_pending": sob_pending,
        "invoices_raised": invoices_raised,
        "payment_pending": payment_pending,
        "payments_made": payments_made,
        "received_payments": received_payments
    }
