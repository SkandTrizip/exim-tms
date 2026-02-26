from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from backend.database import Base
import datetime

class ShipmentDocument(Base):
    __tablename__ = "shipment_documents"

    id = Column(Integer, primary_key=True, index=True)
    enquiry_id = Column(Integer, ForeignKey("enquiries.id", ondelete="CASCADE"), index=True)
    quote_id = Column(Integer, ForeignKey("quotes.id", ondelete="CASCADE"), index=True)
    document_type = Column(String)  # bol, commercialInvoice, packingList, etc.
    file_name = Column(String)
    file_path = Column(String)
    file_size = Column(Integer)
    mime_type = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
