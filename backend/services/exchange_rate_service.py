import datetime

import requests

from backend.config import EXCHANGE_RATE_API_KEY
from backend.utils.logger import logger

_CACHE_DURATION = datetime.timedelta(hours=24)
API_URL = f"https://v6.exchangerate-api.com/v6/{EXCHANGE_RATE_API_KEY}/latest/USD"

# Fallback rates (USD -> currency), used only if the API is unreachable
# and we have no cached data at all.
_FALLBACK_USD_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 157.0,
    "INR": 86.8,
}

_cache: dict = {"rates": None, "last_updated": None}  # rates: USD -> X for every currency


def _fetch_usd_rates() -> dict | None:
    try:
        response = requests.get(API_URL, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("result") == "success":
                return data.get("conversion_rates")
        else:
            logger.error("Failed to fetch exchange rates: HTTP %s", response.status_code)
    except requests.RequestException as exc:
        logger.error("Error fetching exchange rates: %s", exc)
    return None


def _refresh_cache_if_stale() -> None:
    now = datetime.datetime.now()
    if _cache["rates"] is not None and _cache["last_updated"] is not None:
        if now - _cache["last_updated"] < _CACHE_DURATION:
            return

    rates = _fetch_usd_rates()
    if rates:
        _cache["rates"] = rates
        _cache["last_updated"] = now
        logger.info("Refreshed exchange rate cache (USD base)")


def get_exchange_rate(base_currency: str, target_currency: str = "INR") -> float:
    """
    Returns the rate to convert 1 unit of base_currency into target_currency.
    Uses a single cached USD-based rate table and derives cross-rates from it.
    """
    base_currency = base_currency.upper()
    target_currency = target_currency.upper()

    _refresh_cache_if_stale()
    rates = _cache["rates"] or _FALLBACK_USD_RATES

    if base_currency not in rates or target_currency not in rates:
        raise ValueError(f"Unsupported currency pair: {base_currency}->{target_currency}")

    if base_currency == "USD":
        return rates[target_currency]

    # Cross rate via USD: (USD->target) / (USD->base)
    return rates[target_currency] / rates[base_currency]


def get_rates_for(currencies: list, target_currency: str = "INR") -> dict:
    """Convenience helper for the app's 'charge currency dropdown' use case."""
    return {c.upper(): get_exchange_rate(c, target_currency) for c in currencies}


def get_cached_rate_info() -> dict:
    return {
        "rates": _cache["rates"],
        "last_updated": _cache["last_updated"].isoformat() if _cache["last_updated"] else None,
    }
