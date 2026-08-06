from fastapi import APIRouter

from backend.services import exchange_rate_service

router = APIRouter()

# Non-INR currencies offered in the charge currency dropdown.
CHARGE_CURRENCIES = ["USD", "EUR", "GBP", "JPY"]


@router.get("/rate")
def get_rate(currency: str = "USD", target: str = "INR"):
    try:
        rate = exchange_rate_service.get_exchange_rate(currency, target)
        return {"currency": currency.upper(), "target": target.upper(), "rate": rate}
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": str(e), "rate": 93.68}  # Fallback rate


@router.get("/rates")
def get_rates():
    try:
        return exchange_rate_service.get_rates_for(CHARGE_CURRENCIES)
    except Exception as e:
        return {"error": str(e)}
