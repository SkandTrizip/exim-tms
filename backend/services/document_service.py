import os
import shutil
import uuid
from sqlalchemy.orm import Session
from fastapi import UploadFile
from backend.models.document import ShipmentDocument
from backend.config import UPLOAD_DIR
from typing import List, Dict
from backend.utils.logger import logger

def save_document(db: Session, file: UploadFile, enquiry_id: int, quote_id: int, document_type: str, metadata_info: dict = None):
    """Save a file to disk and record its metadata in the database"""
    logger.info(f"Saving document '{document_type}' for enquiry_id={enquiry_id}")
    # Create upload directory if it doesn't exist
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Generate a unique filename to avoid collisions
    file_extension = os.path.splitext(file.filename)[1]
    
    # Check for 2MB limit (2 * 1024 * 1024 bytes)
    MAX_FILE_SIZE = 2 * 1024 * 1024
    
    # Read the file to determine size if it's not already available
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0) # Reset to beginning
    
    if file_size > MAX_FILE_SIZE:
        from fastapi import HTTPException
        logger.warning(f"File upload rejected: {file.filename} is {file_size} bytes, limit is {MAX_FILE_SIZE}")
        raise HTTPException(status_code=400, detail=f"File {file.filename} exceeds the 2MB size limit.")

    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # Save file to disk
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Save metadata to database - store only the filename (not full path)
    db_document = ShipmentDocument(
        enquiry_id=enquiry_id,
        quote_id=quote_id,
        document_type=document_type,
        file_name=file.filename,
        file_path=unique_filename,
        file_size=os.path.getsize(file_path),
        mime_type=file.content_type,
        metadata_info=metadata_info
    )
    
    db.add(db_document)
    db.commit()
    db.refresh(db_document)
    logger.info(f"Document saved successfully: {file_path}")
    return db_document

def update_additional_invoice_document(
    db: Session,
    doc_id: int,
    metadata_info: dict,
    file: UploadFile | None = None,
):
    """Update additional-invoice metadata; optionally replace the uploaded file."""
    from fastapi import HTTPException

    doc = db.query(ShipmentDocument).filter(ShipmentDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if (doc.document_type or "") != "additionalInvoice":
        raise HTTPException(status_code=400, detail="Not an additional invoice document")

    if file and getattr(file, "filename", None):
        if doc.file_path:
            old_path = os.path.join(UPLOAD_DIR, doc.file_path)
            if os.path.isfile(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    logger.warning("Could not remove old additional invoice file: %s", old_path)

        file_extension = os.path.splitext(file.filename)[1]
        MAX_FILE_SIZE = 2 * 1024 * 1024
        file.file.seek(0, os.SEEK_END)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename} exceeds the 2MB size limit.",
            )

        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        doc.file_name = file.filename
        doc.file_path = unique_filename
        doc.file_size = os.path.getsize(file_path)
        doc.mime_type = file.content_type

    doc.metadata_info = metadata_info
    db.commit()
    db.refresh(doc)
    logger.info("Updated additional invoice document id=%s enquiry_id=%s", doc.id, doc.enquiry_id)
    return doc


def get_documents_by_enquiry(db: Session, enquiry_id: int) -> List[ShipmentDocument]:
    """Get all documents associated with an enquiry"""
    return db.query(ShipmentDocument).filter(ShipmentDocument.enquiry_id == enquiry_id).all()

def get_documents_by_quote(db: Session, quote_id: int) -> List[ShipmentDocument]:
    """Get all documents associated with a quote"""
    return db.query(ShipmentDocument).filter(ShipmentDocument.quote_id == quote_id).all()
