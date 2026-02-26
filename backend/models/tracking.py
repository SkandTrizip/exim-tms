from sqlalchemy import Column, Integer, String, DateTime
from backend.database import Base
import datetime

class Tracking(Base):
    __tablename__ = "tracking"

    id = Column(Integer, primary_key=True, index=True)
    shipment_id = Column(String, unique=True, index=True)
    current_location = Column(String)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)
    estimated_delivery = Column(DateTime)
