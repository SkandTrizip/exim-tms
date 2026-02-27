from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from backend.database import get_db
from backend.models.enquiry import Enquiry
from backend.models.quote import Quote
from backend.models.document import ShipmentDocument

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Get dashboard statistics:
    1. Total Enquiry
    2. Pending at Pricing (No 'sent' or 'accepted' quotes)
    3. Pending for Client Confirmation (Has 'sent' quote but no 'accepted' quote)
    4. Booking Secured (Documents uploaded)
    """
    
    # 1. Total Enquiry
    total_enquiries = db.query(Enquiry).count()

    # Define subqueries for status checks
    # Enquiries that have at least one quote in 'sent' or 'accepted' status
    # If an enquiry has NO quotes, or only 'draft' quotes, it is NOT in this list.
    enquiries_passed_pricing = db.query(Quote.enquiry_id)\
        .filter(Quote.status.in_(['sent', 'accepted']))\
        .distinct()

    # Enquiries that have at least one 'accepted' quote
    enquiries_accepted = db.query(Quote.enquiry_id)\
        .filter(Quote.status == 'accepted')\
        .distinct()

    # 2. Pending at Pricing
    # Logic: Enquiries that have NO quotes associated with them.
    pending_at_pricing = db.query(Enquiry).outerjoin(Quote).filter(Quote.id == None).count()

    # Enquiries that have at least one quote (any status)
    enquiries_with_quotes = db.query(Quote.enquiry_id).distinct()

    # 3. Pending for Client Confirmation
    # Logic: Enquiries that have at least one quote created but none 'accepted' yet.
    pending_confirmation = db.query(Enquiry)\
        .filter(Enquiry.id.in_(enquiries_with_quotes))\
        .filter(Enquiry.id.notin_(enquiries_accepted))\
        .count()

    # 4. Booking Pending (was Booking Secured)
    # Logic: Enquiries in Operational Stage (Stage >= 3) where booking is NOT yet confirmed.
    from backend.models.shipment_status import ShipmentStatus

    booking_pending = db.query(Enquiry).outerjoin(ShipmentStatus).filter(
        Enquiry.stage >= 3,
        ShipmentStatus.booking_confirmed == None
    ).count()
    
    # New Stats from ShipmentStatus (Pending Items)
    
    # Logic: Enquiries in Operational Stage (Stage >= 3) where the milestone is NOT yet achieved.
    # We outerjoin because if ShipmentStatus dict doesn't exist, it is definitely pending.
    
    si_pending = db.query(Enquiry).outerjoin(ShipmentStatus).filter(
        Enquiry.stage >= 3, 
        ShipmentStatus.si_submitted == None
    ).count()
    
    bl_pending = db.query(Enquiry).outerjoin(ShipmentStatus).filter(
        Enquiry.stage >= 3, 
        ShipmentStatus.bl_received == None
    ).count()
    
    sob_pending = db.query(Enquiry).outerjoin(ShipmentStatus).filter(
        Enquiry.stage >= 3, 
        ShipmentStatus.sob == None
    ).count()

    from backend.models.invoice import Invoice
    invoices_raised = db.query(Invoice).count()
    
    payment_pending = db.query(Enquiry).outerjoin(ShipmentStatus).filter(
        Enquiry.stage >= 3,
        ShipmentStatus.inv_raised != None,
        ShipmentStatus.pay_client == None
    ).count()

    from backend.models.finance import ShippingPayment
    payments_made = db.query(ShippingPayment).count()

    received_payments = db.query(Invoice).filter(Invoice.is_paid == True).count()

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
