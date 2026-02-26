from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.services.enquiry_service import create_enquiry_logic, get_all_enquiries, update_enquiry_logic, get_enquiry_by_id
from backend.schemas.enquiry import EnquiryCreate, Enquiry
from backend.utils.logger import logger

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
