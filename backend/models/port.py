from sqlalchemy import Column, Integer, String
from backend.database import Base

class PortCode(Base):
    __tablename__ = "port_code"
    __table_args__ = {'extend_existing': True}

    unlocode = Column("UNLOCODE", String, primary_key=True)
    name = Column("Name", String, primary_key=True)
    status = Column("Status", String)
    date = Column("Date", Integer)
    coordinates = Column("Coordinates", String)
