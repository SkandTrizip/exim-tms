import datetime
from typing import Optional, Union

import requests

from backend.config import EXCHANGE_RATE_API_KEY
from backend.utils.logger import logger

_CACHE_DURATION = datetime.timedelta(hours=24)
_API_BASE = f"https://v6.exchangerate-api.com/v6/{EXCHANGE_RATE_API_KEY}"
_LATEST_URL = f"{_API_BASE}/latest/USD"

# Fallback rates (USD -> currency), used only if the API is unreachable
# and we have no cached data at all.
_FALLBACK_USD_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 157.0,
    "INR": 86.8,
}

# rates: USD -> X for every currency; last_updated is when we fetched "latest"
_cache: dict = {"rates": None, "last_updated": None}
# Per calendar-day historical cache: "YYYY-MM-DD" -> {USD->X rates}
_history_cache: dict[str, dict] = {}


def _as_date(value: Optional[Union[datetime.date, datetime.datetime, str]]) -> Optional[datetime.date]:
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d-%b-%y", "%d-%b-%Y", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _fetch_usd_rates_latest() -> dict | None:
    try:
        response = requests.get(_LATEST_URL, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("result") == "success":
                return data.get("conversion_rates")
        else:
            logger.error("Failed to fetch exchange rates: HTTP %s", response.status_code)
    except requests.RequestException as exc:
        logger.error("Error fetching exchange rates: %s", exc)
    return None


def _fetch_usd_rates_for_date(rate_date: datetime.date) -> dict | None:
    """
    Historical mid-rate for a calendar day (ExchangeRate-API history endpoint).
    URL uses year/month/day without zero-padding on month/day.
    """
    url = (
        f"{_API_BASE}/history/USD/"
        f"{rate_date.year}/{rate_date.month}/{rate_date.day}"
    )
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("result") == "success":
                return data.get("conversion_rates")
            err = data.get("error-type") or data.get("result")
            logger.error(
                "Historical exchange rates failed for %s: %s",
                rate_date.isoformat(),
                err,
            )
        else:
            logger.error(
                "Failed to fetch historical rates for %s: HTTP %s",
                rate_date.isoformat(),
                response.status_code,
            )
    except requests.RequestException as exc:
        logger.error("Error fetching historical rates for %s: %s", rate_date.isoformat(), exc)
    return None


def _refresh_latest_cache_if_stale() -> None:
    now = datetime.datetime.now()
    if _cache["rates"] is not None and _cache["last_updated"] is not None:
        if now - _cache["last_updated"] < _CACHE_DURATION:
            return

    rates = _fetch_usd_rates_latest()
    if rates:
        _cache["rates"] = rates
        _cache["last_updated"] = now
        logger.info("Refreshed exchange rate cache (USD base, latest)")


def _usd_rate_table_for_date(rate_date: Optional[datetime.date]) -> dict:
    """
    Rate table keyed USD -> currency.
    - None / today / future → latest (24h cache)
    - Past calendar day → historical mid-rate for that date (cached per day)
    """
    today = datetime.date.today()
    if rate_date is None or rate_date >= today:
        _refresh_latest_cache_if_stale()
        return _cache["rates"] or _FALLBACK_USD_RATES

    key = rate_date.isoformat()
    if key in _history_cache:
        return _history_cache[key]

    rates = _fetch_usd_rates_for_date(rate_date)
    if rates:
        _history_cache[key] = rates
        logger.info("Cached historical USD rates for %s", key)
        return rates

    # Historical endpoint unavailable (plan/quota/network) → fall back to latest
    logger.warning(
        "Historical rates unavailable for %s; falling back to latest USD rates",
        key,
    )
    _refresh_latest_cache_if_stale()
    return _cache["rates"] or _FALLBACK_USD_RATES


def get_exchange_rate(
    base_currency: str,
    target_currency: str = "INR",
    rate_date: Optional[Union[datetime.date, datetime.datetime, str]] = None,
) -> float:
    """
    Returns the rate to convert 1 unit of base_currency into target_currency.
    When rate_date is a past day, uses that calendar day's historical mid-rate;
    otherwise uses the latest published rates.
    """
    base_currency = base_currency.upper()
    target_currency = target_currency.upper()
    as_of = _as_date(rate_date)

    rates = _usd_rate_table_for_date(as_of)

    if base_currency not in rates or target_currency not in rates:
        raise ValueError(f"Unsupported currency pair: {base_currency}->{target_currency}")

    if base_currency == "USD":
        return rates[target_currency]

    # Cross rate via USD: (USD->target) / (USD->base)
    return rates[target_currency] / rates[base_currency]


def get_rates_for(
    currencies: list,
    target_currency: str = "INR",
    rate_date: Optional[Union[datetime.date, datetime.datetime, str]] = None,
) -> dict:
    """Convenience helper for the app's 'charge currency dropdown' use case."""
    return {
        c.upper(): get_exchange_rate(c, target_currency, rate_date=rate_date)
        for c in currencies
    }


def get_cached_rate_info() -> dict:
    return {
        "rates": _cache["rates"],
        "last_updated": _cache["last_updated"].isoformat() if _cache["last_updated"] else None,
        "history_dates": sorted(_history_cache.keys()),
    }
