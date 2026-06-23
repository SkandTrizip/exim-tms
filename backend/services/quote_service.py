from sqlalchemy.orm import Session
from backend.models.quote import Quote, QuoteContainer, QuoteCharge
from backend.models.enquiry import Enquiry
from backend.schemas.quote import QuoteCreate, QuoteUpdate
from typing import List, Optional
from fastapi import HTTPException
import datetime
from backend.utils.logger import logger

def generate_quote_number(db: Session, enquiry_id: int) -> str:
    """Generate a unique quote number based on enquiry and sequence"""
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    
    # Count existing quotes for this enquiry
    quote_count = db.query(Quote).filter(Quote.enquiry_id == enquiry_id).count()
    
    # Format: ENQ_NUMBER-Q001, ENQ_NUMBER-Q002, etc.
    quote_number = f"{enquiry.enquiry_number}-Q{str(quote_count + 1).zfill(3)}"
    logger.info(f"Generated quote number {quote_number} for enquiry_id={enquiry_id}")
    return quote_number


def create_quote(db: Session, quote_data: QuoteCreate) -> Quote:
    """Create a new quote with containers and charges"""
    
    # Verify enquiry exists
    enquiry = db.query(Enquiry).filter(Enquiry.id == quote_data.enquiry_id).first()
    if not enquiry:
        logger.error(f"Failed to create quote: Enquiry {quote_data.enquiry_id} not found")
        raise HTTPException(status_code=404, detail="Enquiry not found")
    
    # Generate quote number
    quote_number = generate_quote_number(db, quote_data.enquiry_id)
    
    # Create quote
    db_quote = Quote(
        enquiry_id=quote_data.enquiry_id,
        quote_number=quote_number,
        quote_name=quote_data.quote_name,
        place_of_receipt=quote_data.place_of_receipt,
        port_of_loading=quote_data.port_of_loading,
        port_of_discharge=quote_data.port_of_discharge,
        final_place_of_delivery=quote_data.final_place_of_delivery,
        shipping_line=quote_data.shipping_line,
        incoterm=quote_data.incoterm,
        rate_currency=quote_data.rate_currency,
        transit_time_days=quote_data.transit_time_days,
        rate_validity_date=quote_data.rate_validity_date,
        destination_free_days=quote_data.destination_free_days,
        total_origin_charges_inr=quote_data.total_origin_charges_inr,
        total_destination_charges_usd=quote_data.total_destination_charges_usd,
        final_quote_inr=quote_data.final_quote_inr,
        status=quote_data.status
    )
    
    db.add(db_quote)
    db.flush()  # Get the quote ID
    
    # Initialize totals
    quote_total_origin_inr = 0.0
    quote_total_dest_usd = 0.0 # Keeping this field but might need review if it stores INR
    quote_final_inr = 0.0

    # Create containers and charges
    for container_seq, container_data in enumerate(quote_data.containers):
        db_container = QuoteContainer(
            quote_id=db_quote.id,
            enquiry_id=db_quote.enquiry_id,
            container_type=container_data.container_type,
            container_sequence=container_seq,
        )
        db.add(db_container)
        db.flush()  # Get the container ID
        
        # Create charges for this container
        for seq, charge_data in enumerate(container_data.charges):
            # Calculate totals if not provided
            calculated_total = charge_data.quantity * charge_data.rate
            calculated_inr = calculated_total * charge_data.exchange_rate

            db_charge = QuoteCharge(
                container_id=db_container.id,
                quote_id=db_quote.id,
                enquiry_id=db_quote.enquiry_id,
                charge_description=charge_data.charge_description,
                account_type=charge_data.account_type,
                currency=charge_data.currency,
                charged_on=charge_data.charged_on,
                quantity=charge_data.quantity,
                rate=charge_data.rate,
                total_amount=calculated_total,
                exchange_rate=charge_data.exchange_rate,
                final_inr_amount=calculated_inr,
                vendor_rate=charge_data.vendor_rate,
                charge_sequence=seq          # preserve row order
            )
            db.add(db_charge)

            # Update quote totals
            if charge_data.account_type == "On Your Account":
                quote_total_origin_inr += calculated_inr
                quote_final_inr += calculated_inr
            else:
                # Assuming destination charges
                # Note: Currently storing USD/Foreign amount in total_destination_charges_usd 
                # or should it be INR? Based on field name it says USD, but frontend shows INR.
                # For now, let's store the INR value in final_quote_inr logic if applicable, 
                # but 'total_destination_charges_usd' might be misleading if we store INR.
                # Use calculated_total if currency is USD? 
                # Let's just track the INR sum for now as the user cares about the PDF "Grand Total" which is usually Origin charges.
                pass
    
    # Update quote totals
    db_quote.total_origin_charges_inr = quote_total_origin_inr
    db_quote.final_quote_inr = quote_final_inr
    
    db.commit()
    db.refresh(db_quote)
    logger.info(f"Quote {db_quote.quote_number} created successfully with ID {db_quote.id}")
    return db_quote


def get_quote_by_id(db: Session, quote_id: int) -> Optional[Quote]:
    """Get a quote by ID with all related data"""
    return db.query(Quote).filter(Quote.id == quote_id).first()


def get_quotes_by_enquiry(db: Session, enquiry_id: int) -> List[Quote]:
    """Get all quotes for a specific enquiry"""
    return db.query(Quote).filter(Quote.enquiry_id == enquiry_id).order_by(Quote.created_at.desc()).all()


def get_all_quotes(db: Session, skip: int = 0, limit: int = 100) -> List[Quote]:
    """Get all quotes with pagination"""
    return db.query(Quote).order_by(Quote.created_at.desc()).offset(skip).limit(limit).all()


def update_quote(db: Session, quote_id: int, quote_data: QuoteUpdate) -> Quote:
    """Update an existing quote"""
    db_quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not db_quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    # Update basic fields
    update_data = quote_data.dict(exclude_unset=True, exclude={'containers'})
    for field, value in update_data.items():
        setattr(db_quote, field, value)
    
    db_quote.updated_at = datetime.datetime.utcnow()
    
    # If containers are provided, replace all containers and charges
    if quote_data.containers is not None:
        # Delete existing charges and containers 
        # (Explicitly delete charges first because bulk delete doesn't trigger Python-side cascades)
        db.query(QuoteCharge).filter(QuoteCharge.quote_id == quote_id).delete()
        db.query(QuoteContainer).filter(QuoteContainer.quote_id == quote_id).delete()
        
        quote_total_origin_inr = 0.0
        quote_final_inr = 0.0
        
        # Create new containers and charges
        for container_seq, container_data in enumerate(quote_data.containers):
            db_container = QuoteContainer(
                quote_id=db_quote.id,
                enquiry_id=db_quote.enquiry_id,
                container_type=container_data.container_type,
                container_sequence=container_seq,
            )
            db.add(db_container)
            db.flush()
            
            for seq, charge_data in enumerate(container_data.charges):
                # Calculate totals
                calculated_total = charge_data.quantity * charge_data.rate
                calculated_inr = calculated_total * charge_data.exchange_rate

                db_charge = QuoteCharge(
                    container_id=db_container.id,
                    quote_id=db_quote.id,
                    enquiry_id=db_quote.enquiry_id,
                    charge_description=charge_data.charge_description,
                    account_type=charge_data.account_type,
                    currency=charge_data.currency,
                    charged_on=charge_data.charged_on,
                    quantity=charge_data.quantity,
                    rate=charge_data.rate,
                    total_amount=calculated_total,
                    exchange_rate=charge_data.exchange_rate,
                    final_inr_amount=calculated_inr,
                    vendor_rate=charge_data.vendor_rate,
                    charge_sequence=seq
                )
                db.add(db_charge)

                # Update quote totals
                if charge_data.account_type == "On Your Account":
                    quote_total_origin_inr += calculated_inr
                    quote_final_inr += calculated_inr
        
        # Update quote totals
        db_quote.total_origin_charges_inr = quote_total_origin_inr
        db_quote.final_quote_inr = quote_final_inr
    
    db.commit()
    db.refresh(db_quote)
    return db_quote


def delete_quote(db: Session, quote_id: int) -> bool:
    """Delete a quote and all related data"""
    db_quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not db_quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    db.delete(db_quote)
    db.commit()
    return True


def update_quote_status(db: Session, quote_id: int, status: str) -> Quote:
    """Update only the status of a quote"""
    db_quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not db_quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    db_quote.status = status
    db_quote.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(db_quote)
    return db_quote
