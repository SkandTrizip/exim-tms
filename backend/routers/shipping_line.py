from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import os, shutil, uuid, datetime

from backend.database import get_db
from backend.models.shipping_line import ShippingLine
from backend.schemas.shipping_line import (
    ShippingLine as ShippingLineSchema,
    ShippingLineCreate,
    ShippingLineUpdate,
)
from backend.config import UPLOAD_DIR
from backend.routers.auth import get_current_user, require_admin
from backend.models.user import User

router = APIRouter()

# ── Helpers ───────────────────────────────────────────────────────────────────

def save_upload(file: UploadFile, subfolder: str = "shipping_lines") -> str:
    dest_dir = os.path.join(UPLOAD_DIR, subfolder)
    os.makedirs(dest_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(dest_dir, filename)
    with open(dest, "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    return f"/uploads/{subfolder}/{filename}"

# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ShippingLineSchema])
def list_shipping_lines(db: Session = Depends(get_db)):
    return db.query(ShippingLine).all()

@router.get("/pending", response_model=List[ShippingLineSchema])
def list_pending(db: Session = Depends(get_db)):
    return db.query(ShippingLine).filter(ShippingLine.status == "pending").all()

@router.get("/verified", response_model=List[ShippingLineSchema])
def list_verified(db: Session = Depends(get_db)):
    return db.query(ShippingLine).filter(ShippingLine.status == "verified").all()

# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=ShippingLineSchema, status_code=status.HTTP_201_CREATED)
def create_shipping_line(
    data: ShippingLineCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    existing = db.query(ShippingLine).filter(
        ShippingLine.shipping_line_name == data.shipping_line_name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A shipping line with this name already exists")

    payload = data.dict(exclude_none=True)
    # Remove status/submitted_by from user-supplied data — always set server-side
    payload.pop("status", None)
    payload.pop("submitted_by", None)

    sl = ShippingLine(
        **payload,
        status="pending",
        submitted_by=current_user.username if current_user else "unknown"
    )
    db.add(sl)
    db.commit()
    db.refresh(sl)
    return sl

# ── Verify (admin only) ───────────────────────────────────────────────────────

@router.patch("/{id}/verify", response_model=ShippingLineSchema)
def verify_shipping_line(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    sl = db.query(ShippingLine).filter(ShippingLine.id == id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Shipping Line not found")
    if sl.status == "verified":
        raise HTTPException(status_code=400, detail="Already verified")

    sl.status      = "verified"
    sl.verified_by = admin.username
    sl.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(sl)
    return sl

@router.patch("/{id}/reject", response_model=ShippingLineSchema)
def reject_shipping_line(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    sl = db.query(ShippingLine).filter(ShippingLine.id == id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Shipping Line not found")
    sl.status      = "rejected"
    sl.verified_by = admin.username
    sl.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(sl)
    return sl

# ── Update / Delete ───────────────────────────────────────────────────────────

@router.get("/{id}", response_model=ShippingLineSchema)
def get_shipping_line(id: int, db: Session = Depends(get_db)):
    sl = db.query(ShippingLine).filter(ShippingLine.id == id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Shipping Line not found")
    return sl

@router.put("/{id}", response_model=ShippingLineSchema)
def update_shipping_line(
    id: int,
    data: ShippingLineUpdate,
    db: Session = Depends(get_db)
):
    sl = db.query(ShippingLine).filter(ShippingLine.id == id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Shipping Line not found")
    for key, value in data.dict(exclude_none=True).items():
        setattr(sl, key, value)
    db.commit()
    db.refresh(sl)
    return sl

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shipping_line(id: int, db: Session = Depends(get_db)):
    sl = db.query(ShippingLine).filter(ShippingLine.id == id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Shipping Line not found")
    db.delete(sl)
    db.commit()

# ── Document upload ───────────────────────────────────────────────────────────

@router.post("/{id}/upload-docs", response_model=ShippingLineSchema)
def upload_shipping_line_docs(
    id: int,
    gst_doc:    Optional[UploadFile] = File(None),
    pan_doc:    Optional[UploadFile] = File(None),
    cheque_doc: Optional[UploadFile] = File(None),
    tds_doc:    Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    sl = db.query(ShippingLine).filter(ShippingLine.id == id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Shipping Line not found")

    if gst_doc    and gst_doc.filename:    sl.gst_doc_path    = save_upload(gst_doc)
    if pan_doc    and pan_doc.filename:    sl.pan_doc_path    = save_upload(pan_doc)
    if cheque_doc and cheque_doc.filename: sl.cheque_doc_path = save_upload(cheque_doc)
    if tds_doc    and tds_doc.filename:    sl.tds_doc_path    = save_upload(tds_doc)

    db.commit()
    db.refresh(sl)
    return sl
