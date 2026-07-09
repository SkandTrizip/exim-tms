from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import datetime
from backend.database import get_db
from backend.services import document_service, status_service
from backend.services.enquiry_economics_service import sync_enquiry_economics
from backend.schemas.document import ShipmentDocument
from backend.utils.logger import logger

router = APIRouter(prefix="/tracking", tags=["Tracking & Documents"])

@router.post("/")
def upload_documents(
    tracking_data: str = Form(...),
    bol: Optional[UploadFile] = File(None),
    bl: Optional[UploadFile] = File(None),
    commercialInvoice: Optional[UploadFile] = File(None),
    packingList: Optional[UploadFile] = File(None),
    originCert: Optional[UploadFile] = File(None),
    shippingInvoice: Optional[UploadFile] = File(None),
    customsDeclaration: Optional[UploadFile] = File(None),
    insuranceCert: Optional[UploadFile] = File(None),
    clientConfirm: Optional[UploadFile] = File(None),
    booking: Optional[UploadFile] = File(None),
    draftSi: Optional[UploadFile] = File(None),
    si: Optional[UploadFile] = File(None),
    shippingBill: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Upload shipment documents and link them to an enquiry/quote.
    tracking_data should be a JSON string containing enquiry_id and quote_id.
    """
    try:
        data = json.loads(tracking_data)
        enquiry_id = data.get("enquiry_id")
        quote_id = data.get("quote_id")
        checklist_state = data.get("checklist_state")
        metadata_map = data.get("metadata_map", {})
        
        logger.info(f"Processing tracking documents update for enquiry ID {enquiry_id}")
        
        if not enquiry_id:
            raise HTTPException(status_code=400, detail="enquiry_id is required")

        # Update checklist status if provided
        if checklist_state:
            status_service.update_shipment_status(db, enquiry_id, checklist_state)


        uploaded_docs = []
        # Frontend historically sent the BL file under `bl`; persist as `bol` for one canonical type.
        bol_upload = bol if bol and getattr(bol, "filename", None) else bl
        files_to_process = {
            "bol": bol_upload,
            "commercialInvoice": commercialInvoice,
            "packingList": packingList,
            "shippingInvoice": shippingInvoice,
            "originCert": originCert,
            "customsDeclaration": customsDeclaration,
            "insuranceCert": insuranceCert,
            "clientConfirm": clientConfirm,
            "booking": booking,
            "draftSi": draftSi,
            "si": si,
            "shippingBill": shippingBill
        }

        for doc_type, file in files_to_process.items():
            if file:
                # Use metadata from map if available for this doc_type
                metadata_info = metadata_map.get(doc_type)
                
                doc = document_service.save_document(
                    db, file, enquiry_id, quote_id, doc_type, metadata_info
                )
                uploaded_docs.append(doc)

        logger.info(f"Successfully processed {len(uploaded_docs)} documents for enquiry ID {enquiry_id}")
        return {
            "message": "Documents uploaded successfully",
            "enquiry_id": enquiry_id,
            "documents_count": len(uploaded_docs),
            "documents": [doc.id for doc in uploaded_docs]
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid tracking_data format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/bulk")
def get_status_bulk(ids: str, db: Session = Depends(get_db)):
    """
    Get shipment statuses for multiple enquiries in a single DB call.
    ids: comma-separated list of enquiry IDs, e.g. '1,2,3'
    Returns: { enquiry_id: status_object }
    """
    try:
        id_list = [int(i.strip()) for i in ids.split(",") if i.strip().isdigit()]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ids parameter")

    from backend.models.shipment_status import ShipmentStatus
    from backend.models.finance import ShippingPayment

    statuses = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id.in_(id_list)).all()
    payment_rows = (
        db.query(ShippingPayment.enquiry_id)
        .filter(ShippingPayment.enquiry_id.in_(id_list))
        .distinct()
        .all()
    )
    paid_enquiry_ids = {row[0] for row in payment_rows}

    result = {}
    for s in statuses:
        has_payment = s.enquiry_id in paid_enquiry_ids or s.pay_line is not None
        result[s.enquiry_id] = {
            "enquiry_id":       s.enquiry_id,
            "booking_confirmed": s.booking_confirmed,
            "si_submitted":     s.si_submitted,
            "bl_received":      s.bl_received,
            "sob":              s.sob,
            "pay_line":         s.pay_line,
            "inv_raised":       s.inv_raised,
            "pay_client":       s.pay_client,
            "shipping_invoice": s.shipping_invoice,
            "shipping_payment_done": has_payment,
            "master_number":    getattr(s, 'master_number', None),
        }
    return result

@router.get("/status/{enquiry_id}")
def get_status(enquiry_id: int, db: Session = Depends(get_db)):
    """Get shipment status checklist for an enquiry"""
    return status_service.get_shipment_status(db, enquiry_id)

@router.post("/status/{enquiry_id}")
def update_status(enquiry_id: int, status_data: dict, db: Session = Depends(get_db)):
    """Update shipment status checklist and metadata for an enquiry"""
    try:
        return status_service.update_shipment_status(db, enquiry_id, status_data)
    except Exception as e:
        logger.error(f"Failed to update status for enquiry ID {enquiry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/enquiry/{enquiry_id}", response_model=List[ShipmentDocument])
def get_enquiry_documents(enquiry_id: int, db: Session = Depends(get_db)):
    """Get all documents for a specific enquiry"""
    return document_service.get_documents_by_enquiry(db, enquiry_id)

@router.get("/additional-invoices/bulk")
def get_additional_invoice_docs_bulk(ids: str, db: Session = Depends(get_db)):
    """
    Bulk fetch additional-invoice docs for multiple enquiries.

    ids: comma-separated enquiry IDs.
    Returns: { enquiry_id: [ {id, created_at, metadata_info} ] }

    Business rule: only include additional invoices created after 8th July 2026
    (i.e. created_at >= 2026-07-09 00:00:00).
    """
    try:
        id_list = [int(i.strip()) for i in (ids or "").split(",") if i.strip().isdigit()]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ids parameter")

    if not id_list:
        return {}

    from backend.models.document import ShipmentDocument as ShipmentDocumentModel

    cutoff = datetime.datetime(2026, 7, 9, 0, 0, 0)
    rows = (
        db.query(
            ShipmentDocumentModel.enquiry_id,
            ShipmentDocumentModel.id,
            ShipmentDocumentModel.created_at,
            ShipmentDocumentModel.metadata_info,
        )
        .filter(
            ShipmentDocumentModel.enquiry_id.in_(id_list),
            ShipmentDocumentModel.document_type == "additionalInvoice",
            ShipmentDocumentModel.created_at >= cutoff,
        )
        .order_by(ShipmentDocumentModel.enquiry_id.asc(), ShipmentDocumentModel.created_at.asc())
        .all()
    )

    out: dict[int, list[dict]] = {}
    for enquiry_id, doc_id, created_at, metadata_info in rows:
        out.setdefault(int(enquiry_id), []).append(
            {
                "id": int(doc_id),
                "created_at": created_at,
                "metadata_info": metadata_info or {},
            }
        )
    return out


@router.get("/additional-invoices/{enquiry_id}")
def get_additional_invoice_docs(enquiry_id: int, db: Session = Depends(get_db)):
    """Additional invoice docs for a single enquiry (after 8 Jul 2026)."""
    from backend.models.document import ShipmentDocument as ShipmentDocumentModel

    cutoff = datetime.datetime(2026, 7, 9, 0, 0, 0)
    rows = (
        db.query(
            ShipmentDocumentModel.id,
            ShipmentDocumentModel.created_at,
            ShipmentDocumentModel.metadata_info,
        )
        .filter(
            ShipmentDocumentModel.enquiry_id == enquiry_id,
            ShipmentDocumentModel.document_type == "additionalInvoice",
            ShipmentDocumentModel.created_at >= cutoff,
        )
        .order_by(ShipmentDocumentModel.created_at.asc())
        .all()
    )
    return [
        {"id": int(doc_id), "created_at": created_at, "metadata_info": metadata_info or {}}
        for doc_id, created_at, metadata_info in rows
    ]

@router.post("/upload-single")
def upload_single_document(
    enquiry_id: int = Form(...),
    document_type: str = Form(...),
    metadata: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        metadata_info = None
        if metadata:
            try:
                metadata_info = json.loads(metadata)
            except json.JSONDecodeError:
                logger.warning(f"Invalid metadata JSON for enquiry ID {enquiry_id}")

        logger.info(f"Processing single {document_type} upload for enquiry ID {enquiry_id}")
        doc = document_service.save_document(
            db, file, enquiry_id, None, document_type, metadata_info
        )
        if document_type == "additionalInvoice":
            sync_enquiry_economics(db, enquiry_id, commit=True)
        return doc
    except Exception as e:
        logger.error(f"Single document upload failed for enquiry ID {enquiry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
