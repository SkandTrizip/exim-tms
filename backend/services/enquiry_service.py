import re
from sqlalchemy.orm import Session
from backend.models.enquiry import Enquiry
from backend.utils.logger import logger


def get_next_enquiry_number(db: Session, year: int, month: int) -> str:
    """
    Next job number in format LLP/OFE/YY/MM/NNNNN.
    Sequence resets to 00001 at the start of each month.
    """
    yy = str(year)[-2:]
    mm = str(month).zfill(2)
    prefix = f"LLP/OFE/{yy}/{mm}/"
    rows = db.query(Enquiry.enquiry_number).filter(Enquiry.enquiry_number.like(f"{prefix}%")).all()
    pat = re.compile(rf"^LLP/OFE/{yy}/{mm}/(\d+)$")
    max_seq = 0
    for (num,) in rows:
        if not num or not isinstance(num, str):
            continue
        m = pat.match(num.strip())
        if m:
            max_seq = max(max_seq, int(m.group(1)))
    next_seq = max_seq + 1
    return f"{prefix}{str(next_seq).zfill(5)}"

def create_enquiry_logic(db: Session, data: dict):
    new_enquiry = Enquiry(**data)
    db.add(new_enquiry)
    db.commit()
    db.refresh(new_enquiry)
    logger.info(f"Created new enquiry: {new_enquiry.enquiry_number} (ID: {new_enquiry.id})")
    return new_enquiry

def get_all_enquiries(db: Session, skip: int = 0, limit: int = 10_000):
    """List enquiries with bounded pagination (newest first)."""
    safe_limit = max(1, min(limit, 10_000))
    safe_skip = max(0, skip)
    return (
        db.query(Enquiry)
        .order_by(Enquiry.id.desc())
        .offset(safe_skip)
        .limit(safe_limit)
        .all()
    )

def get_enquiry_by_id(db: Session, enquiry_id: int):
    return db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()

def update_enquiry_logic(db: Session, enquiry_id: int, data: dict):
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        logger.warning(f"Update failed: Enquiry ID {enquiry_id} not found")
        return None

    # Before tracking (stage < 3): keep quote Per Container qty in sync with sales.
    old_stage = enquiry.stage or 1
    old_count = enquiry.container_count
    new_count = data["container_count"] if "container_count" in data else old_count

    for key, value in data.items():
        setattr(enquiry, key, value)

    if old_stage < 3 and "container_count" in data:
        try:
            old_n = int(old_count) if old_count is not None else None
            new_n = int(new_count) if new_count is not None else None
        except (TypeError, ValueError):
            old_n, new_n = old_count, new_count
        if new_n is not None and new_n != old_n:
            from backend.services.quote_service import sync_per_container_quantities

            sync_per_container_quantities(db, enquiry_id, new_n, commit=False)

    db.commit()
    db.refresh(enquiry)
    logger.info(f"Updated enquiry ID {enquiry_id}")
    return enquiry
