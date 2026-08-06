from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.schemas.quote import (
    Quote, QuoteCreate, QuoteUpdate, 
    QuoteListResponse, QuoteDetailResponse, QuoteStatusUpdate,
)
from backend.schemas.final_quote import FinalQuote, FinalQuoteUpdate
from backend.services import quote_service
from backend.services import final_quote_service
from backend.models.enquiry import Enquiry
from backend.utils.logger import logger

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.post("/", response_model=Quote, status_code=status.HTTP_201_CREATED)
def create_quote(quote: QuoteCreate, db: Session = Depends(get_db)):
    """
    Create a new quote for an enquiry.
    
    This endpoint creates a quote with all containers and their associated charges.
    The quote number is auto-generated based on the enquiry number.
    """
    try:
        logger.info(f"Received request to create quote for enquiry {quote.enquiry_id}")
        return quote_service.create_quote(db, quote)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error creating quote: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating quote: {str(e)}"
        )


@router.get("/", response_model=QuoteListResponse)
def get_all_quotes(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """
    Get all quotes with pagination.
    
    - **skip**: Number of records to skip (for pagination)
    - **limit**: Maximum number of records to return
    """
    quotes = quote_service.get_all_quotes(db, skip=skip, limit=limit)
    total = db.query(quote_service.Quote).count()
    return {"quotes": quotes, "total": total}


@router.get("/enquiry/{enquiry_id}", response_model=List[Quote])
def get_quotes_by_enquiry(enquiry_id: int, db: Session = Depends(get_db)):
    """
    Get all quotes for a specific enquiry.
    
    Returns all quotes associated with the given enquiry ID, ordered by creation date (newest first).
    """
    quotes = quote_service.get_quotes_by_enquiry(db, enquiry_id)
    return quotes


@router.get("/{quote_id}", response_model=QuoteDetailResponse)
def get_quote(quote_id: int, db: Session = Depends(get_db)):
    """
    Get a specific quote by ID with full details.
    
    Returns the quote with all containers, charges, and related enquiry information.
    """
    quote = quote_service.get_quote_by_id(db, quote_id)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quote with ID {quote_id} not found"
        )
    
    # Get enquiry details
    enquiry = db.query(Enquiry).filter(Enquiry.id == quote.enquiry_id).first()
    
    return {
        "quote": quote,
        "enquiry_number": enquiry.enquiry_number if enquiry else None,
        "client_name": enquiry.client_name if enquiry else None
    }


@router.put("/{quote_id}", response_model=Quote)
def update_quote(
    quote_id: int, 
    quote_data: QuoteUpdate, 
    db: Session = Depends(get_db)
):
    """
    Update an existing quote.
    
    You can update any field of the quote. If containers are provided,
    all existing containers and charges will be replaced with the new data.
    """
    try:
        logger.info(f"Received update request for quote ID {quote_id}")
        return quote_service.update_quote(db, quote_id, quote_data)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating quote {quote_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating quote: {str(e)}"
        )


@router.patch("/{quote_id}/status", response_model=Quote)
def update_quote_status(
    quote_id: int, 
    status: str,
    body: Optional[QuoteStatusUpdate] = Body(None),
    db: Session = Depends(get_db),
):
    """
    Update only the status of a quote.

    Valid statuses: draft, sent, accepted, rejected.
    When accepting after SI, include remarks_reason (and remarks_other if reason is 'other') in the body.
    Remarks are optional for the first client confirmation.
    """
    valid_statuses = ["draft", "sent", "accepted", "rejected"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    remarks_reason = body.remarks_reason if body else None
    remarks_other = body.remarks_other if body else None
    
    return quote_service.update_quote_status(
        db, quote_id, status, remarks_reason, remarks_other
    )


@router.put("/{quote_id}/final-revision", response_model=FinalQuote)
def update_final_revision(
    quote_id: int,
    quote_data: FinalQuoteUpdate,
    db: Session = Depends(get_db),
):
    """
    Update final quote charge lines (final_quotes tables) after SI is submitted.
    The source quote (initial confirmed rates) is never modified.
    """
    try:
        logger.info(f"Final quote revision for source quote ID {quote_id}")
        return final_quote_service.update_final_revision(db, quote_id, quote_data)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating final revision for quote {quote_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating final quote: {str(e)}",
        )


@router.get("/{quote_id}/final", response_model=Optional[FinalQuote])
def get_final_quote(quote_id: int, db: Session = Depends(get_db)):
    """Return the final quote with containers/charges, or null if not created yet."""
    return final_quote_service.get_final_by_source_quote_id(db, quote_id)


@router.get("/{quote_id}/initial", response_model=QuoteDetailResponse)
def get_initial_quote(quote_id: int, db: Session = Depends(get_db)):
    """Return the frozen initial (source) quote — same data as at client confirmation."""
    quote = quote_service.get_quote_by_id(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.status != "accepted":
        raise HTTPException(status_code=400, detail="Initial quote view is only for accepted quotes")
    enquiry = db.query(Enquiry).filter(Enquiry.id == quote.enquiry_id).first()
    return {
        "quote": quote,
        "enquiry_number": enquiry.enquiry_number if enquiry else None,
        "client_name": enquiry.client_name if enquiry else None,
    }


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quote(quote_id: int, db: Session = Depends(get_db)):
    """
    Delete a quote and all associated data.
    
    This will permanently delete the quote, all containers, and all charges.
    """
    try:
        logger.info(f"Deleting quote ID {quote_id}")
        quote_service.delete_quote(db, quote_id)
        return None
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error deleting quote {quote_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting quote: {str(e)}"
        )
