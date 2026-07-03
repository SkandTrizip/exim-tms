import datetime

import requests

from backend.config import EXCHANGE_RATE_API_KEY
from backend.utils.logger import logger

_cached_rate: float | None = None
_last_updated: datetime.datetime | None = None
_CACHE_DURATION = datetime.timedelta(hours=24)

API_URL = f"https://v6.exchangerate-api.com/v6/{EXCHANGE_RATE_API_KEY}/latest/USD"
_FALLBACK_RATE = 86.8


def get_usd_inr_rate() -> float:
    global _cached_rate, _last_updated

    now = datetime.datetime.now()

    if _cached_rate is not None and _last_updated is not None:
        if now - _last_updated < _CACHE_DURATION:
            return _cached_rate

    try:
        response = requests.get(API_URL, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("result") == "success":
                rate = data.get("conversion_rates", {}).get("INR")
                if rate:
                    _cached_rate = float(rate)
                    _last_updated = now
                    logger.info("Updated USD->INR exchange rate to %s", _cached_rate)
                    return _cached_rate
        else:
            logger.error("Failed to fetch exchange rate: HTTP %s", response.status_code)
    except requests.RequestException as exc:
        logger.error("Error fetching exchange rate: %s", exc)

    return _cached_rate if _cached_rate is not None else _FALLBACK_RATE


def get_cached_rate_info() -> dict:
    return {
        "rate": _cached_rate,
        "last_updated": _last_updated.isoformat() if _last_updated else None,
    }
