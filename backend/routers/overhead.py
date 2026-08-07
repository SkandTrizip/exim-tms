from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from backend.database import get_db
from backend.models.overhead import Overhead
from backend.schemas.overhead import (
    Overhead as OverheadSchema,
    OverheadCreate,
    OverheadUpdate,
)
from backend.routers.auth import get_current_user, require_admin
from backend.models.user import User

router = APIRouter()

# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[OverheadSchema])
def list_overheads(db: Session = Depends(get_db)):
    return db.query(Overhead).order_by(Overhead.overhead_name).all()

@router.get("/verified", response_model=List[OverheadSchema])
def list_verified(db: Session = Depends(get_db)):
    return (
        db.query(Overhead)
        .filter(Overhead.status == "verified")
        .order_by(Overhead.overhead_name)
        .all()
    )

# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=OverheadSchema, status_code=status.HTTP_201_CREATED)
def create_overhead(
    data: OverheadCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    if not data.overhead_name:
        raise HTTPException(status_code=400, detail="Overhead name is required")

    payload = data.dict(exclude_none=True)
    payload.pop("status", None)
    payload.pop("submitted_by", None)

    ov = Overhead(
        **payload,
        status="pending",
        submitted_by=current_user.username if current_user else "unknown",
    )
    db.add(ov)
    db.commit()
    db.refresh(ov)
    return ov

# ── Verify / Reject (admin only) ──────────────────────────────────────────────

@router.patch("/{id}/verify", response_model=OverheadSchema)
def verify_overhead(id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ov = db.query(Overhead).filter(Overhead.id == id).first()
    if not ov:
        raise HTTPException(status_code=404, detail="Overhead not found")
    if ov.status == "verified":
        raise HTTPException(status_code=400, detail="Already verified")
    ov.status = "verified"
    ov.verified_by = admin.username
    ov.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(ov)
    return ov

@router.patch("/{id}/reject", response_model=OverheadSchema)
def reject_overhead(id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ov = db.query(Overhead).filter(Overhead.id == id).first()
    if not ov:
        raise HTTPException(status_code=404, detail="Overhead not found")
    ov.status = "rejected"
    ov.verified_by = admin.username
    ov.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(ov)
    return ov

# ── Get / Update / Delete ─────────────────────────────────────────────────────

@router.get("/{id}", response_model=OverheadSchema)
def get_overhead(id: int, db: Session = Depends(get_db)):
    ov = db.query(Overhead).filter(Overhead.id == id).first()
    if not ov:
        raise HTTPException(status_code=404, detail="Overhead not found")
    return ov

@router.put("/{id}", response_model=OverheadSchema)
def update_overhead(id: int, data: OverheadUpdate, db: Session = Depends(get_db)):
    ov = db.query(Overhead).filter(Overhead.id == id).first()
    if not ov:
        raise HTTPException(status_code=404, detail="Overhead not found")
    for key, value in data.dict(exclude_none=True).items():
        if key in ("status", "submitted_by"):
            continue
        setattr(ov, key, value)
    db.commit()
    db.refresh(ov)
    return ov

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_overhead(id: int, db: Session = Depends(get_db)):
    ov = db.query(Overhead).filter(Overhead.id == id).first()
    if not ov:
        raise HTTPException(status_code=404, detail="Overhead not found")
    db.delete(ov)
    db.commit()
