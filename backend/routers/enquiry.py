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
async def next_enquiry_number_endpoint(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Next job number: LLP/OFE/YY/MM/NNNNN (resets each month)."""
    now = datetime.utcnow()
    y = year if year is not None else now.year
    m = month if month is not None else now.month
    number = get_next_enquiry_number(db, y, m)
    logger.info(f"Next enquiry number for {y}/{m}: {number}")
    return {"enquiry_number": number}


@router.get("/hbl-pending")
async def get_hbl_pending(db: Session = Depends(get_db)):
    """Enquiries where HBL is required and SI has been submitted."""
    from backend.models.enquiry import Enquiry as EnquiryModel
    from backend.models.shipment_status import ShipmentStatus
    rows = (
        db.query(EnquiryModel, ShipmentStatus)
        .outerjoin(ShipmentStatus, EnquiryModel.id == ShipmentStatus.enquiry_id)
        .filter(
            EnquiryModel.hbl_required == True,
            EnquiryModel.is_void == False,
            ShipmentStatus.si_submitted != None,
        )
        .order_by(EnquiryModel.id.desc())
        .all()
    )
    result = []
    for enq, status in rows:
        result.append({
            "id": enq.id,
            "enquiry_number": enq.enquiry_number,
            "client_name": enq.client_name,
            "delivery_agent": enq.delivery_agent,
            "notify_party_address": enq.notify_party_address,
            "notify_party_2_address": enq.notify_party_2_address,
            "vessel": enq.vessel or (status.vessel if status else None),
            "voyage_no": enq.voyage_no or (status.voyage if status else None),
            "origin": enq.origin,
            "destination": enq.destination,
            "si_submitted": status.si_submitted.isoformat() if status and status.si_submitted else None,
            "si_number": status.si_number if status else None,
            "consignee": status.consignee if status else None,
            "master_number": status.master_number if status else None,
            "created_at": enq.created_at.isoformat() if enq.created_at else None,
        })
    return result


@router.get("/hbl-document/{enquiry_id}")
async def get_hbl_document_data(enquiry_id: int, db: Session = Depends(get_db)):
    """Full data needed to render an HBL / MTD document."""
    from backend.models.enquiry import Enquiry as EnquiryModel
    from backend.models.shipment_status import ShipmentStatus
    from backend.models.quote import Quote
    from backend.models.shipping_line import ShippingLine
    from backend.models.client_origin import ClientOrigin
    from backend.models.client_master import ClientMaster
    from backend.utils.client_utils import strip_branch_suffix, build_consignor_block

    enq = db.query(EnquiryModel).filter(EnquiryModel.id == enquiry_id).first()
    if not enq:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    status = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == enquiry_id).first()
    accepted_quote = (
        db.query(Quote)
        .filter(Quote.enquiry_id == enquiry_id, Quote.status == "accepted")
        .first()
    )
    if not accepted_quote:
        accepted_quote = db.query(Quote).filter(Quote.enquiry_id == enquiry_id).first()

    sl = None
    if accepted_quote and accepted_quote.shipping_line:
        sl = db.query(ShippingLine).filter(ShippingLine.shipping_line_name == accepted_quote.shipping_line).first()

    # Consignor = client master / origin details (name, address, phone, email)
    client_origin = None
    client_master = None
    if enq.client_name:
        base_client_name = strip_branch_suffix(enq.client_name)
        client_origin = db.query(ClientOrigin).filter(
            ClientOrigin.unique_client_name == base_client_name
        ).first()
        if client_origin:
            client_master = db.query(ClientMaster).filter(
                ClientMaster.origin_id == client_origin.id,
                ClientMaster.client_name == enq.client_name,
            ).first()
            if not client_master:
                client_master = db.query(ClientMaster).filter(
                    ClientMaster.origin_id == client_origin.id
                ).first()
        else:
            client_master = db.query(ClientMaster).filter(
                ClientMaster.client_name == enq.client_name
            ).first()
            if client_master:
                client_origin = db.query(ClientOrigin).filter(
                    ClientOrigin.id == client_master.origin_id
                ).first()

    consignor = build_consignor_block(enq.client_name or "", client_master, client_origin)

    return {
        "id": enq.id,
        "enquiry_number": enq.enquiry_number,
        "client_name": enq.client_name,
        "consignor": consignor,
        "origin": enq.origin,
        "destination": enq.destination,
        "preferred_origin_port": enq.preferred_origin_port,
        "preferred_destination_port": enq.preferred_destination_port,
        "commodity": enq.commodity,
        "hs_code": enq.hs_code,
        "container_type": enq.container_type,
        "container_count": enq.container_count,
        "weight_per_container": enq.weight_per_container,
        "weight_measurement": enq.weight_measurement,
        "delivery_agent": enq.delivery_agent,
        "notify_party_address": enq.notify_party_address,
        "notify_party_2_address": enq.notify_party_2_address,
        "vessel": enq.vessel or (status.vessel if status else None),
        "voyage_no": enq.voyage_no or (status.voyage if status else None),
        "mode_of_transport_origin": enq.mode_of_transport_origin,
        "created_at": enq.created_at.isoformat() if enq.created_at else None,
        "shipping_line": accepted_quote.shipping_line if accepted_quote else None,
        "shipping_line_address": sl.office_address if sl else None,
        "shipping_line_location": sl.office_location if sl else None,
        "shipping_line_contact_person": sl.primary_contact_person if sl else None,
        "shipping_line_contact_number": sl.primary_contact_number if sl else None,
        "shipping_line_email": sl.secondary_email if sl else None,
        "shipping_line_gst": sl.gst_number if sl else None,
        "place_of_receipt": accepted_quote.place_of_receipt if accepted_quote else None,
        "port_of_loading": accepted_quote.port_of_loading if accepted_quote else None,
        "port_of_discharge": accepted_quote.port_of_discharge if accepted_quote else None,
        "final_place_of_delivery": accepted_quote.final_place_of_delivery if accepted_quote else None,
        "consignee": status.consignee if status else None,
        "si_number": status.si_number if status else None,
        "master_number": status.master_number if status else None,
        "etd": status.etd.isoformat() if status and status.etd else None,
        "eta": status.eta.isoformat() if status and status.eta else None,
        "sob": status.sob.isoformat() if status and status.sob else None,
        "si_submitted": status.si_submitted.isoformat() if status and status.si_submitted else None,
    }


@router.get("/{enquiry_id}", response_model=Enquiry)
async def get_enquiry(enquiry_id: int, db: Session = Depends(get_db)):
    enquiry = get_enquiry_by_id(db, enquiry_id)
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return enquiry
@router.patch("/{enquiry_id}/hbl-fields")
async def update_hbl_fields(enquiry_id: int, payload: dict, db: Session = Depends(get_db)):
    """Update only HBL-related fields on a confirmed enquiry."""
    from backend.models.enquiry import Enquiry as EnquiryModel
    allowed = {
        "hbl_required", "delivery_agent", "vessel", "voyage_no",
        "notify_party_address", "notify_party_2_address",
    }
    enq = db.query(EnquiryModel).filter(EnquiryModel.id == enquiry_id).first()
    if not enq:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    for key, val in payload.items():
        if key in allowed:
            setattr(enq, key, val)
    db.commit()
    db.refresh(enq)
    logger.info(f"Updated HBL fields for enquiry {enquiry_id}")
    return {"status": "ok", "id": enq.id}

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
