# Configuration constants for both Backend and Frontend

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Upload directory path (absolute path on the server)
UPLOAD_DIR = "/home/azureuser/uploads/"
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
# UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(_PROJECT_ROOT / "uploads"))

# Injected into /js/config.js as CONFIG.API_URL. Use '' so the browser calls /api on the same host
# you opened (localhost, 127.0.0.1, or a public IP). A fixed remote URL breaks local dev (Failed to fetch).
API_URL = os.getenv("API_URL", "")

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

# Shared HTML → PDF API (WeasyPrint). Set PDF_API_KEY in .env for external callers.
PDF_API_KEY = os.getenv("PDF_API_KEY", "")
PDF_MAX_HTML_BYTES = int(os.getenv("PDF_MAX_HTML_BYTES", str(1000 * 1024)))  # 1000 KB

# Database (used by backend/database.py)
POSTGRES_USER = os.getenv("POSTGRES_USER", "tmsbackend")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "sharkship@5")
POSTGRES_DB = os.getenv("POSTGRES_DB", "exim_prod")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "generalagent.postgres.database.azure.com")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
EXCHANGE_RATE_API_KEY = os.getenv("EXCHANGE_RATE_API_KEY", "602d23926fb209dcce76d258")

# POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
# POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "Skand0822%40")
# POSTGRES_DB = os.getenv("POSTGRES_DB", "exim_local")
# POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
# POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
# EXCHANGE_RATE_API_KEY = os.getenv("EXCHANGE_RATE_API_KEY", "602d23926fb209dcce76d258")

# SQLAlchemy pool tuning (override via env if needed)
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "600"))

AUTH_USERS = [
    {"username": "Rohit", "full_name": "Rohit", "password": "rohit@3145", "is_admin": True},
    {"username": "admin", "full_name": "Rohit", "password": "logipod@488!", "is_admin": True},
    {"username": "Sachin", "full_name": "Sachin ", "password": "sachin@5789!#$", "is_admin": False},
    {"username": "Shokin", "full_name":"Shokin Saifi","password": "shokin@2538!#", "is_admin": False},
    {"username": "Operations", "full_name":"Dapen","password": "ops@4567!#", "is_admin": False},
    {"username": "ashok.jangra@logipod.in", "full_name":"Ashok","password": "ashok@4567!#", "is_admin": False},
    {"username": "satkar.grewal@logipod.in", "full_name":"Satkar","password": "exim@4532!#", "is_admin": False},
    {"username": "madan.rajput@logipod.in", "full_name":"Madan","password": "madan@4568!#", "is_admin": False},
    {"username": "ca@logipod.in", "full_name":"Shobhit","password": "ca@4569!#", "is_admin": False},
    {"username": "Sales", "full_name":"Sales","password": "sales@4567!#", "is_admin": False},

]

# Admin usernames (case-insensitive check is done in code)
ADMIN_USERS = [u["username"].lower() for u in AUTH_USERS if u.get("is_admin")]

CONTAINER_TYPES = [
    "20'STD", "40'STD", "40'HC", "45'HC",
    "20'FR(In-guage)", "40'FR(In-guage)",
    "20'FR(Out-guage)", "40'FR(Out-guage)",
    "20'OT(In-guage)", "40'OT(In-guage)",
    "20'OT(Out-guage)", "40'OT(Out-guage)",
    "20'Reefer", "40'Reefer"
]

SHIPMENT_TYPES = ["FCL (Full Container Load)", "LCL (Less Container Load)", "Air Freight"]
CLIENTS = [] # Now fetched from CLIENT MASTER (Database)
SCOPES = ["Port to Port", "Port to Door", "Door to Port", "Door to Door"]
MODES = ["Rail - Line Scope", "Road - Logipod Scope", "Rail - Client Scope", "Road - Client Scope"]
INCOTERMS = [
    "EXW - Ex Works", "CIF - Cost, Insurance & Freight", "CFR - Cost & Freight", 
    "DAP - Delivered at Place", "DDP - Delivered Duty Paid", "FOB - Free on Board"
]
SHIPPING_LINES = ["Maersk", "MSC", "CMA CGM", "Hapag-Lloyd", "ONE", "Evergreen", "HMM", "Yang Ming", "ZIM", "Wan Hai"]

DEFAULT_CHARGES = [
    { "desc": "Ocean Freight", "account": "On Your Account", "curr": "USD", "on": "Per Container" },
    { "desc": "BL Fee", "account": "On Your Account", "curr": "INR", "on": "Per BL" },
    { "desc": "Origin THC", "account": "On Your Account", "curr": "INR", "on": "Per Container" },
    { "desc": "Seal Charge", "account": "On Your Account", "curr": "INR", "on": "Per Container" },
]

# Currencies offered on charge line items; INR is always settlement currency (rate 1).
CHARGE_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "INR"]

def get_frontend_config() -> dict:
    return {
        "containerTypes": CONTAINER_TYPES,
        "shipmentTypes": SHIPMENT_TYPES,
        "clients": CLIENTS,
        "scopes": SCOPES,
        "modes": MODES,
        "incoterms": INCOTERMS,
        "shippingLines": SHIPPING_LINES,
        "defaultCharges": DEFAULT_CHARGES,
        "CHARGE_CURRENCIES": CHARGE_CURRENCIES,
    }


def build_database_url() -> str:
    """Build a PostgreSQL URL with a URL-encoded password."""
    from urllib.parse import quote_plus

    encoded_password = quote_plus(POSTGRES_PASSWORD)
    return (
        f"postgresql://{POSTGRES_USER}:{encoded_password}"
        f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )
