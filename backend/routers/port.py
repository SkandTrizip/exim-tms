from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.models.port import PortCode
from backend.schemas.port import PortCode as PortCodeSchema

router = APIRouter()

@router.get("/search", response_model=List[PortCodeSchema])
def search_ports(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """
    Search ports by name or UNLOCODE
    """
    ports = db.query(PortCode).filter(
        (PortCode.name.ilike(f"%{q}%")) | 
        (PortCode.unlocode.ilike(f"%{q}%"))
    ).limit(10).all()
    return ports

@router.get("/search-by-code", response_model=List[PortCodeSchema])
def search_ports_by_code(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """
    Search ports primarily by UNLOCODE (port code)
    """
    # First try exact match on port code
    ports = db.query(PortCode).filter(
        PortCode.unlocode.ilike(f"{q}%")
    ).limit(10).all()
    
    # If no results, fall back to searching in name as well
    if not ports:
        ports = db.query(PortCode).filter(
            (PortCode.unlocode.ilike(f"%{q}%")) | 
            (PortCode.name.ilike(f"%{q}%"))
        ).limit(10).all()
    
    return ports
