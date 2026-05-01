from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime
from backend.routers.auth import require_admin, get_current_user
from backend.models.user import User
from backend.database import get_db
from backend.models.client_master import ClientMaster
from backend.models.client_origin import ClientOrigin
from backend.schemas.client_master import ClientMaster as ClientMasterSchema, ClientMasterCreate
from backend.schemas.client_origin import ClientOrigin as ClientOriginSchema, ClientOriginCreate

router = APIRouter()

# ── List endpoints ─────────────────────────────────────────────────────────────

@router.get("/origins", response_model=List[ClientOriginSchema])
def get_all_origins(db: Session = Depends(get_db)):
    return db.query(ClientOrigin).all()

@router.get("/masters")
def get_all_client_masters(db: Session = Depends(get_db)):
    from backend.utils.client_utils import strip_branch_suffix
    """
    Returns all masters joined with their origin so the frontend can build
    CompanyName_Main / CompanyName_City labels without extra API calls.
    """
    masters = db.query(ClientMaster).all()

    # For each origin, the branch with the smallest id is treated as "main"
    from collections import defaultdict
    origin_min_id: dict = defaultdict(lambda: float('inf'))
    for m in masters:
        if m.origin_id and m.id < origin_min_id[m.origin_id]:
            origin_min_id[m.origin_id] = m.id

    result = []
    for m in masters:
        origin = db.query(ClientOrigin).filter(ClientOrigin.id == m.origin_id).first()
        base_name = origin.unique_client_name if origin else m.client_name
        is_main = (m.id == origin_min_id.get(m.origin_id))
        d = {
            "id": m.id,
            "origin_id": m.origin_id,
            "client_code": m.client_code,
            "client_name": m.client_name,
            "unique_client_name": base_name,
            "is_main": is_main,
            "office_location": m.office_location,
            "office_address": m.office_address,
            "gst_name": m.gst_name,
            "gst_no": m.gst_no,
            "pan_no": m.pan_no,
            "iec_code": m.iec_code,
            "contact_person": m.contact_person,
            "contact_no": m.contact_no,
            "email_id": m.email_id,
            "sales_branch": m.sales_branch,
            "sales_person": m.sales_person,
            "cs_name": m.cs_name,
            "credit_period": m.credit_period,
            "credit_amount": m.credit_amount,
            "payment_terms": m.payment_terms,
            "status": m.status,
        }
        result.append(d)
    return result

# ── Create endpoints ───────────────────────────────────────────────────────────

@router.post("/origins", status_code=status.HTTP_201_CREATED)
def create_client_origin(data: ClientOriginCreate, db: Session = Depends(get_db)):
    existing = db.query(ClientOrigin).filter(
        ClientOrigin.unique_client_name == data.unique_client_name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A client origin with this name already exists")

    # Save Client Origin
    origin = ClientOrigin(**data.dict(exclude_none=True))
    db.add(origin)
    db.flush()  # get origin.id before commit

    # Auto-generate a client_code for the main branch
    # e.g. "Tata Motors Ltd" → "TATAMOT-MAIN", fallback to "CLIENT-<id>-MAIN"
    name_parts = (data.unique_client_name or "").upper().split()
    abbr = "".join(p[:3] for p in name_parts[:3]).replace(" ", "")[:8]
    base_code = f"{abbr}-MAIN" if abbr else f"CLIENT-{origin.id}-MAIN"

    # Ensure uniqueness
    code_candidate = base_code
    suffix = 1
    while db.query(ClientMaster).filter(ClientMaster.client_code == code_candidate).first():
        code_candidate = f"{base_code}-{suffix}"
        suffix += 1

    # Create ClientMaster as the Main Branch, copying all shared fields
    main_branch = ClientMaster(
        origin_id=origin.id,
        client_code=code_candidate,
        client_name=data.unique_client_name,
        gst_name=data.unique_client_name,
        gst_no=data.gst_no,
        office_location=data.office_location,
        office_address=data.office_address,
        country=data.country,
        pin_code=data.pin_code,
        contact_person=data.contact_person,
        contact_no=data.contact_no,
        email_id=data.email_id,
        contact_person_logistics=data.contact_person_logistics,
        contact_no_logistics=data.contact_no_logistics,
        email_id_logistics=data.email_id_logistics,
        contact_person_finance=data.contact_person_finance,
        contact_no_finance=data.contact_no_finance,
        email_id_finance=data.email_id_finance,
        sales_branch=data.sales_branch,
        sales_person=data.sales_person,
        cs_name=data.cs_name,
        created_by="System (Auto – Main Branch)",
    )
    db.add(main_branch)
    db.commit()
    db.refresh(origin)
    db.refresh(main_branch)

    return {
        "origin": origin,
        "main_branch": main_branch,
        "message": f"Client Origin and Main Branch ('{code_candidate}') created successfully."
    }

@router.post("/masters", response_model=ClientMasterSchema, status_code=status.HTTP_201_CREATED)
def create_client_master(data: ClientMasterCreate, db: Session = Depends(get_db)):
    existing = db.query(ClientMaster).filter(
        ClientMaster.client_code == data.client_code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A client with this client code already exists")
    master = ClientMaster(**data.dict(exclude_none=True))
    db.add(master)
    db.commit()
    db.refresh(master)
    return master

@router.patch("/masters/{id}", response_model=ClientMasterSchema)
def update_client_master(id: int, data: ClientMasterCreate, db: Session = Depends(get_db)):
    # Note using ClientMasterCreate for partial update or ClientMasterUpdate if available
    master = db.query(ClientMaster).filter(ClientMaster.id == id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Client Master not found")
        
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(master, key, value)
        
    db.commit()
    db.refresh(master)
    return master

# ── Detail / relation endpoints ───────────────────────────────────────────────

@router.get("/masters/by-origin/{origin_id}", response_model=List[ClientMasterSchema])
def get_masters_by_origin(origin_id: int, db: Session = Depends(get_db)):
    return db.query(ClientMaster).filter(ClientMaster.origin_id == origin_id).all()

@router.get("/master/by-enquiry/{enquiry_id}")
def get_client_details_for_enquiry(enquiry_id: int, db: Session = Depends(get_db)):
    from backend.models.enquiry import Enquiry
    from backend.utils.client_utils import strip_branch_suffix
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    # Strip the branch suffix ("Acme_Mumbai" → "Acme") before looking up the origin
    base_name = strip_branch_suffix(enquiry.client_name)

    origin = db.query(ClientOrigin).filter(
        ClientOrigin.unique_client_name == base_name
    ).first()

    if not origin:
        # Fallback: try matching by branch client_name directly
        master = db.query(ClientMaster).filter(
            ClientMaster.client_name == enquiry.client_name
        ).first()
        if master:
            origin = db.query(ClientOrigin).filter(ClientOrigin.id == master.origin_id).first()
        else:
            return {"error": f"No client origin or master found matching '{enquiry.client_name}'"}
    
    # Find the specific branch matching the stored client_name (for branch-specific details)
    # First try exact match, then fallback to first branch of origin
    master = db.query(ClientMaster).filter(
        ClientMaster.origin_id == origin.id,
        ClientMaster.client_name == enquiry.client_name
    ).first()
    if not master:
        master = db.query(ClientMaster).filter(ClientMaster.origin_id == origin.id).first()

    if not master:
        return {"error": "Client master (branch) not found for this origin"}

    return {"master": master, "origin": origin}

@router.get("/origin/{id}", response_model=ClientOriginSchema)
def get_client_origin(id: int, db: Session = Depends(get_db)):
    origin = db.query(ClientOrigin).filter(ClientOrigin.id == id).first()
    if not origin:
        raise HTTPException(status_code=404, detail="Client Origin not found")
    return origin

@router.get("/master/{id}", response_model=ClientMasterSchema)
def get_client_master(id: int, db: Session = Depends(get_db)):
    master = db.query(ClientMaster).filter(ClientMaster.id == id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Client Master not found")
    return master

@router.patch("/master/{id}/verify", response_model=ClientMasterSchema)
def verify_client_master(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    master = db.query(ClientMaster).filter(ClientMaster.id == id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Client Master not found")
    if master.status == "verified":
        raise HTTPException(status_code=400, detail="Already verified")

    master.status = "verified"
    master.verified_by = admin.username
    master.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(master)
    return master

@router.patch("/master/{id}/reject", response_model=ClientMasterSchema)
def reject_client_master(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    master = db.query(ClientMaster).filter(ClientMaster.id == id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Client Master not found")
    
    master.status = "rejected"
    master.verified_by = admin.username
    master.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(master)
    return master
