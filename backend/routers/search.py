from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.schemas.search import SearchResponse, ShipmentDetailResponse
from backend.services.search_service import SEARCH_SCOPES, get_shipment_detail, global_search

router = APIRouter(prefix="/search", tags=["Global Search"])


@router.get("", response_model=SearchResponse)
async def search_shipments(
    q: str = Query(..., min_length=3, description="Search text (min 3 characters)"),
    scope: Optional[List[str]] = Query(None, description="Filter scopes: all, enquiry, client, shipping_line, mbl, invoice, document"),
    limit: int = Query(25, ge=1, le=100),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    if scope:
        invalid = [s for s in scope if s.lower() not in SEARCH_SCOPES]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid scope(s): {', '.join(invalid)}")

    results, total = global_search(db, q, scope, limit=limit, skip=skip)
    return SearchResponse(query=q.strip(), total=total, results=results)


@router.get("/shipment/{enquiry_id}", response_model=ShipmentDetailResponse)
async def shipment_detail(enquiry_id: int, db: Session = Depends(get_db)):
    detail = get_shipment_detail(db, enquiry_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return detail
