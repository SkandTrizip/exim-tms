from sqlalchemy.orm import Session
from backend.models.shipment_status import ShipmentStatus
from datetime import datetime
import json
from backend.utils.logger import logger

def update_shipment_status(db: Session, enquiry_id: int, status_data: dict):
    """
    Update or create shipment status checklist for an enquiry.
    """
    # Check if a status record already exists
    status = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == enquiry_id).first()
    
    if not status:
        logger.info(f"Creating new shipment status for enquiry ID {enquiry_id}")
        status = ShipmentStatus(enquiry_id=enquiry_id)
        db.add(status)
    else:
        logger.info(f"Updating existing shipment status for enquiry ID {enquiry_id}")
    
    # Map checklist items to model fields
    field_mapping = {
        'booking_confirmed': 'booking_confirmed',
        'booking_placed': 'booking_placed',
        'booking_finalized': 'booking_finalized',
        'container_picked': 'container_picked',
        'stuffing_done': 'stuffing_done',
        'container_gated': 'container_gated',
        'draft_si': 'draft_si',
        'si_submitted': 'si_submitted',
        'form13': 'form13',
        'shipping_bill': 'shipping_bill',
        'sob': 'sob',
        'shipping_invoice': 'shipping_invoice',
        'bl_received': 'bl_received',
        'origin_cert': 'origin_cert',
        'customs_decl': 'customs_decl',
        'insurance_cert': 'insurance_cert'
    }
    
    for key, field in field_mapping.items():
        if key in status_data:
            item_data = status_data[key]
            if isinstance(item_data, dict) and item_data.get('checked'):
                # Convert date string to datetime if possible, otherwise use current time
                date_str = item_data.get('date')
                try:
                    # Expected format: "18 Feb 2026, 17:46"
                    if date_str and date_str != '-':
                        setattr(status, field, datetime.strptime(date_str, "%d %b %y, %H:%M"))
                    elif item_data.get('checked'):
                        setattr(status, field, datetime.now())
                except:
                    # Fallback to current time if parsing fails
                    setattr(status, field, datetime.now())
            else:
                setattr(status, field, None)

    # Map extra metadata fields if provided
    metadata_fields = [
        'si_number', 'consignee', 'port_of_origin', 
        'final_destination', 'vessel', 'voyage', 'master_number', 'container_number',
        'pay_line', 'inv_raised', 'pay_client',
        'utr_number', 'payment_date', 'payment_amount'
    ]
    
    datetime_meta = {'pay_line', 'inv_raised', 'pay_client'}
    for field in metadata_fields:
        if field not in status_data:
            continue
        val = status_data[field]
        if field in datetime_meta:
            if val:
                try:
                    setattr(status, field, datetime.fromisoformat(val.replace('Z', '+00:00')))
                except Exception:
                    setattr(status, field, datetime.now())
            else:
                setattr(status, field, None)
        else:
            # Always persist text metadata (including empty strings to allow clearing)
            setattr(status, field, val if val is not None else None)

    # Handle Date fields in metadata (etd, eta, payment_date)
    for field in ['etd', 'eta', 'payment_date']:
        if field in status_data and status_data[field]:
            try:
                # Expecting YYYY-MM-DD from HTML date input
                setattr(status, field, datetime.strptime(status_data[field], "%Y-%m-%d"))
            except:
                pass
    
    db.commit()
    db.refresh(status)
    logger.info(f"Successfully processed shipment status for enquiry ID {enquiry_id}")
    return status

def get_shipment_status(db: Session, enquiry_id: int):
    """Get status record for an enquiry"""
    return db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == enquiry_id).first()
