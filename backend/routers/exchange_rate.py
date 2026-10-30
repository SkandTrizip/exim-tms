from typing import Optional

from fastapi import APIRouter, Query

from backend.services import exchange_rate_service

router = APIRouter()

# Non-INR currencies offered in the charge currency dropdown.
CHARGE_CURRENCIES = ["USD", "EUR", "GBP", "JPY"]


@router.get("/rate")
def get_rate(
    currency: str = "USD",
    target: str = "INR",
    date: Optional[str] = Query(None, description="YYYY-MM-DD; past days use historical mid-rate"),
):
    try:
        rate = exchange_rate_service.get_exchange_rate(currency, target, rate_date=date)
        return {
            "currency": currency.upper(),
            "target": target.upper(),
            "rate": rate,
            "date": date,
        }
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": str(e), "rate": 93.68}  # Fallback rate


@router.get("/rates")
def get_rates(
    date: Optional[str] = Query(None, description="YYYY-MM-DD; past days use historical mid-rate"),
):
    try:
        return exchange_rate_service.get_rates_for(CHARGE_CURRENCIES, rate_date=date)
    except Exception as e:
        return {"error": str(e)}
