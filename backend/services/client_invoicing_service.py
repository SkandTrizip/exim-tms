"""Resolve per-client customer invoicing settings for enquiries."""
from __future__ import annotations

from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from backend.config import CUSTOMER_INVOICING_STANDARD, CUSTOMER_INVOICING_DUAL_USD_INR
from backend.models.client_master import ClientMaster
from backend.models.client_origin import ClientOrigin
from backend.models.enquiry import Enquiry
from backend.utils.client_utils import strip_branch_suffix


def normalize_customer_invoicing_type(raw: Optional[str]) -> str:
    val = (raw or CUSTOMER_INVOICING_STANDARD).strip().lower()
    if val == CUSTOMER_INVOICING_DUAL_USD_INR:
        return CUSTOMER_INVOICING_DUAL_USD_INR
    return CUSTOMER_INVOICING_STANDARD


def is_dual_usd_inr_invoicing(invoicing_type: Optional[str]) -> bool:
    return normalize_customer_invoicing_type(invoicing_type) == CUSTOMER_INVOICING_DUAL_USD_INR


def _master_for_enquiry(db: Session, enquiry: Enquiry) -> Optional[ClientMaster]:
    base_name = strip_branch_suffix(enquiry.client_name or "")
    origin = (
        db.query(ClientOrigin)
        .filter(ClientOrigin.unique_client_name == base_name)
        .first()
    )
    if not origin:
        master = (
            db.query(ClientMaster)
            .filter(ClientMaster.client_name == enquiry.client_name)
            .first()
        )
        if master:
            origin = db.query(ClientOrigin).filter(ClientOrigin.id == master.origin_id).first()
        if not origin:
            return master

    master = (
        db.query(ClientMaster)
        .filter(
            ClientMaster.origin_id == origin.id,
            ClientMaster.client_name == enquiry.client_name,
        )
        .first()
    )
    if not master:
        master = (
            db.query(ClientMaster)
            .filter(ClientMaster.origin_id == origin.id)
            .first()
        )
    return master


def get_customer_invoicing_type_for_enquiry(db: Session, enquiry_id: int) -> str:
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        return CUSTOMER_INVOICING_STANDARD
    master = _master_for_enquiry(db, enquiry)
    if not master:
        return CUSTOMER_INVOICING_STANDARD
    return normalize_customer_invoicing_type(
        getattr(master, "customer_invoicing_type", None)
    )


def get_customer_invoicing_types_for_enquiries(
    db: Session, enquiry_ids: List[int]
) -> Dict[int, str]:
    if not enquiry_ids:
        return {}
    unique_ids = list({int(i) for i in enquiry_ids if i is not None})
    enquiries = db.query(Enquiry).filter(Enquiry.id.in_(unique_ids)).all()
    result: Dict[int, str] = {}
    for enq in enquiries:
        master = _master_for_enquiry(db, enq)
        raw = getattr(master, "customer_invoicing_type", None) if master else None
        result[enq.id] = normalize_customer_invoicing_type(raw)
    return result
