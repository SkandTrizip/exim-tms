from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.services.enquiry_service import (
    create_enquiry_logic,
    get_all_enquiries,
    update_enquiry_logic,
    get_enquiry_by_id,
    get_next_enquiry_number,
)
from backend.schemas.enquiry import EnquiryCreate, Enquiry
from backend.utils.logger import logger
from backend.routers.auth import require_admin
from backend.models.user import User

router = APIRouter()

@router.post("/", response_model=Enquiry)
async def create_enquiry(enquiry_data: EnquiryCreate, db: Session = Depends(get_db)):
    return create_enquiry_logic(db, enquiry_data.model_dump())

@router.put("/{enquiry_id}", response_model=Enquiry)
async def update_enquiry(enquiry_id: int, enquiry_data: EnquiryCreate, db: Session = Depends(get_db)):
    logger.info(f"Received update request for enquiry {enquiry_id}")
    updated = update_enquiry_logic(db, enquiry_id, enquiry_data.model_dump())
    if not updated:
        logger.warning(f"Enquiry {enquiry_id} not found for update")
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return updated

@router.get("/", response_model=list[Enquiry])
async def list_enquiries(db: Session = Depends(get_db)):
    return get_all_enquiries(db)


@router.get("/next-number")
async def next_enquiry_number_endpoint(year: Optional[int] = None, db: Session = Depends(get_db)):
    """Next sale/enquiry number for EXIM-YYYY-### (max sequence + 1 for that year)."""
    y = year if year is not None else datetime.utcnow().year
    number = get_next_enquiry_number(db, y)
    logger.info(f"Next enquiry number for {y}: {number}")
    return {"enquiry_number": number}


@router.get("/{enquiry_id}", response_model=Enquiry)
async def get_enquiry(enquiry_id: int, db: Session = Depends(get_db)):
    enquiry = get_enquiry_by_id(db, enquiry_id)
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return enquiry
@router.patch("/{enquiry_id}/stage", response_model=Enquiry)
async def update_enquiry_stage(enquiry_id: int, stage: int, db: Session = Depends(get_db)):
    updated = update_enquiry_logic(db, enquiry_id, {"stage": stage})
    if not updated:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return updated

@router.patch("/{enquiry_id}/void", response_model=Enquiry)
async def void_enquiry(
    enquiry_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin)
):
    """Admin-only: toggle is_void flag on an enquiry."""
    from backend.models.enquiry import Enquiry as EnquiryModel
    enquiry = db.query(EnquiryModel).filter(EnquiryModel.id == enquiry_id).first()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    enquiry.is_void = not enquiry.is_void
    db.commit()
    db.refresh(enquiry)
    action = "voided" if enquiry.is_void else "un-voided"
    logger.info(f"Admin {_admin.username} {action} enquiry {enquiry_id}")
    return enquiry
