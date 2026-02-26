from fastapi import APIRouter
from backend.services import exchange_rate_service

router = APIRouter()

@router.get("/rate")
def get_rate():
    try:
        rate = exchange_rate_service.get_usd_inr_rate()
        return {"rate": rate}
    except Exception as e:
        return {"error": str(e), "rate": 93.68} # Fallback rate
