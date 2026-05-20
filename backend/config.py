# Configuration constants for both Backend and Frontend

# Upload directory path (absolute path on the server)
UPLOAD_DIR = "/home/azureuser/uploads/"

# Injected into /js/config.js as CONFIG.API_URL. Use '' so the browser calls /api on the same host
# you opened (localhost, 127.0.0.1, or a public IP). A fixed remote URL breaks local dev (Failed to fetch).
#API_URL = 'http://localhost:8000'
API_URL = 'http://20.193.250.226:8000'

AUTH_USERS = [
    {"username": "Rohit", "full_name": "Rohit", "password": "rohit@3145", "is_admin": False},
    {"username": "admin", "full_name": "Rohit", "password": "logipod@488!", "is_admin": True},
    {"username": "Sachin", "full_name": "Sachin ", "password": "sachin@5789!#$", "is_admin": False},
    {"username": "Shokin", "full_name":"Shokin Saifi","password": "shokin@2538!#", "is_admin": False},
    {"username": "Operations", "full_name":"Dapen","password": "ops@4567!#", "is_admin": False}
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
    }
