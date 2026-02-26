from sqlalchemy.orm import Session
from backend.models.enquiry import Enquiry
from backend.utils.logger import logger

def create_enquiry_logic(db: Session, data: dict):
    new_enquiry = Enquiry(**data)
    db.add(new_enquiry)
    db.commit()
    db.refresh(new_enquiry)
    logger.info(f"Created new enquiry: {new_enquiry.enquiry_number} (ID: {new_enquiry.id})")
    return new_enquiry

def get_all_enquiries(db: Session):
    return db.query(Enquiry).order_by(Enquiry.id.desc()).all()

def get_enquiry_by_id(db: Session, enquiry_id: int):
    return db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()

def update_enquiry_logic(db: Session, enquiry_id: int, data: dict):
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        logger.warning(f"Update failed: Enquiry ID {enquiry_id} not found")
        return None
    
    for key, value in data.items():
        setattr(enquiry, key, value)
    
    db.commit()
    db.refresh(enquiry)
    logger.info(f"Updated enquiry ID {enquiry_id}")
    return enquiry
