import requests
import datetime
import logging

# Module-level cache
_cached_rate = None
_last_updated = None
_CACHE_DURATION = datetime.timedelta(hours=24)

API_KEY = "602d23926fb209dcce76d258"
API_URL = f"https://v6.exchangerate-api.com/v6/{API_KEY}/latest/USD"

def get_usd_inr_rate():
    global _cached_rate, _last_updated
    
    now = datetime.datetime.now()
    
    if _cached_rate is not None and _last_updated is not None:
        if now - _last_updated < _CACHE_DURATION:
            return _cached_rate

    try:
        response = requests.get(API_URL)
        if response.status_code == 200:
            data = response.json()
            if data["result"] == "success":
                rate = data["conversion_rates"].get("INR")
                if rate:
                    _cached_rate = rate
                    _last_updated = now
                    logging.info(f"Updated USD->INR exchange rate to {_cached_rate}")
                    return _cached_rate
        else:
            logging.error(f"Failed to fetch exchange rate: {response.status_code}")
    except Exception as e:
        logging.error(f"Error fetching exchange rate: {e}")
            
    # Return cached rate (even if stale) if fetch fails, or default fallback
    return _cached_rate if _cached_rate else 86.8 # Fallback default

def get_cached_rate_info():
    return {
        "rate": _cached_rate,
        "last_updated": _last_updated.isoformat() if _last_updated else None
    }
