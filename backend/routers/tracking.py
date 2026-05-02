from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import json
from backend.database import get_db
from backend.services import document_service, status_service
from backend.schemas.document import ShipmentDocument
from backend.utils.logger import logger

router = APIRouter(prefix="/tracking", tags=["Tracking & Documents"])

@router.post("/")
async def upload_documents(
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
async def get_status_bulk(ids: str, db: Session = Depends(get_db)):
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
    statuses = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id.in_(id_list)).all()

    result = {}
    for s in statuses:
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
            "master_number":    getattr(s, 'master_number', None),
        }
    return result

@router.get("/status/{enquiry_id}")
async def get_status(enquiry_id: int, db: Session = Depends(get_db)):
    """Get shipment status checklist for an enquiry"""
    return status_service.get_shipment_status(db, enquiry_id)

@router.post("/status/{enquiry_id}")
async def update_status(enquiry_id: int, status_data: dict, db: Session = Depends(get_db)):
    """Update shipment status checklist and metadata for an enquiry"""
    try:
        return status_service.update_shipment_status(db, enquiry_id, status_data)
    except Exception as e:
        logger.error(f"Failed to update status for enquiry ID {enquiry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/enquiry/{enquiry_id}", response_model=List[ShipmentDocument])
async def get_enquiry_documents(enquiry_id: int, db: Session = Depends(get_db)):
    """Get all documents for a specific enquiry"""
    return document_service.get_documents_by_enquiry(db, enquiry_id)

@router.post("/upload-single")
async def upload_single_document(
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
        return doc
    except Exception as e:
        logger.error(f"Single document upload failed for enquiry ID {enquiry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
