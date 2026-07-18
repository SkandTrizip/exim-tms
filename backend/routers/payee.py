from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from backend.database import get_db
from backend.models.payee import Payee
from backend.schemas.payee import (
    Payee as PayeeSchema,
    PayeeCreate,
    PayeeUpdate,
)
from backend.routers.auth import get_current_user, require_admin
from backend.models.user import User

router = APIRouter()

# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[PayeeSchema])
def list_payees(db: Session = Depends(get_db)):
    return db.query(Payee).order_by(Payee.payee_name).all()

@router.get("/verified", response_model=List[PayeeSchema])
def list_verified(db: Session = Depends(get_db)):
    return (
        db.query(Payee)
        .filter(Payee.status == "verified")
        .order_by(Payee.payee_name)
        .all()
    )

# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=PayeeSchema, status_code=status.HTTP_201_CREATED)
def create_payee(
    data: PayeeCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    if not data.payee_name:
        raise HTTPException(status_code=400, detail="Payee name is required")

    existing = db.query(Payee).filter(Payee.payee_name == data.payee_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A payee with this name already exists")

    payload = data.dict(exclude_none=True)
    payload.pop("status", None)
    payload.pop("submitted_by", None)

    payee = Payee(
        **payload,
        status="pending",
        submitted_by=current_user.username if current_user else "unknown",
    )
    db.add(payee)
    db.commit()
    db.refresh(payee)
    return payee

# ── Verify / Reject (admin only) ──────────────────────────────────────────────

@router.patch("/{id}/verify", response_model=PayeeSchema)
def verify_payee(id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    payee = db.query(Payee).filter(Payee.id == id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    if payee.status == "verified":
        raise HTTPException(status_code=400, detail="Already verified")
    payee.status = "verified"
    payee.verified_by = admin.username
    payee.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(payee)
    return payee

@router.patch("/{id}/reject", response_model=PayeeSchema)
def reject_payee(id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    payee = db.query(Payee).filter(Payee.id == id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    payee.status = "rejected"
    payee.verified_by = admin.username
    payee.verified_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(payee)
    return payee

# ── Get / Update / Delete ─────────────────────────────────────────────────────

@router.get("/{id}", response_model=PayeeSchema)
def get_payee(id: int, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.id == id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    return payee

@router.put("/{id}", response_model=PayeeSchema)
def update_payee(id: int, data: PayeeUpdate, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.id == id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    for key, value in data.dict(exclude_none=True).items():
        if key in ("status", "submitted_by"):
            continue
        setattr(payee, key, value)
    db.commit()
    db.refresh(payee)
    return payee

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payee(id: int, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.id == id).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    db.delete(payee)
    db.commit()
