import re
from sqlalchemy.orm import Session
from backend.models.enquiry import Enquiry
from backend.utils.logger import logger


def get_next_enquiry_number(db: Session, year: int) -> str:
    """
    Next EXIM-{year}-### based on the highest existing sequence for that year,
    not on row count (avoids wrong numbers when rows are deleted or other years exist).
    """
    prefix = f"EXIM-{year}-"
    rows = db.query(Enquiry.enquiry_number).filter(Enquiry.enquiry_number.like(f"{prefix}%")).all()
    pattern = re.compile(rf"^EXIM-{year}-(\d+)$")
    max_seq = 0
    for (num,) in rows:
        if not num or not isinstance(num, str):
            continue
        m = pattern.match(num.strip())
        if m:
            max_seq = max(max_seq, int(m.group(1)))
    next_seq = max_seq + 1
    return f"EXIM-{year}-{str(next_seq).zfill(3)}"

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
