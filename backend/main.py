import sys
import os
import time
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add the project root to sys.path to resolve 'backend' imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.routers import enquiry, pricing, workflow, port, exchange_rate, quote, tracking, auth, client, dashboard, invoice, finance, shipping_line
from backend.models.user import User
from backend.models.invoice import Invoice
from backend.models.finance import ShippingPayment
from backend.config import get_frontend_config, UPLOAD_DIR, API_URL, ADMIN_USERS
from backend.utils.logger import logger
import json

from backend.database import engine, Base
from sqlalchemy import text, inspect
from sqlalchemy.exc import ProgrammingError

# Create database tables
Base.metadata.create_all(bind=engine)

# Auto-add new columns to existing tables when they don't exist yet
_column_migrations = [
    ("enquiries", "hbl_required", "BOOLEAN DEFAULT false"),
    ("enquiries", "delivery_agent", "TEXT"),
    ("enquiries", "vessel", "VARCHAR"),
    ("enquiries", "voyage_no", "VARCHAR"),
    ("enquiries", "notify_party_address", "TEXT"),
    ("enquiries", "notify_party_2_address", "TEXT"),
    ("enquiries", "hbl_document_snapshot", "TEXT"),
    ("enquiries", "hbl_document_saved_at", "TIMESTAMP"),
    ("shipment_statuses", "container_number", "VARCHAR"),
    ("invoices", "customer_invoice_no", "VARCHAR"),
]
with engine.connect() as _conn:
    _inspector = inspect(engine)
    for _table, _col, _col_type in _column_migrations:
        existing = [c["name"] for c in _inspector.get_columns(_table)]
        if _col not in existing:
            try:
                _conn.execute(text(f'ALTER TABLE {_table} ADD COLUMN {_col} {_col_type}'))
                logger.info(f"Added column {_table}.{_col}")
            except ProgrammingError:
                # If multiple workers start at once, or the inspector is stale,
                # the column may already exist; don't crash the app.
                logger.info(f"Column already exists (race): {_table}.{_col}")
    _conn.commit()

app = FastAPI(
    title="Exim TMS API",
    description="Backend API for Exim Transport Management System",
    version="1.0.0"
)

logger.info("Starting Exim TMS API Application...")

# --- Request/Response logging (targeted + safe) ---
def _truncate_bytes(data: bytes, limit: int = 4096) -> bytes:
    if data is None:
        return b""
    if len(data) <= limit:
        return data
    return data[:limit] + b"...<truncated>"

def _is_textual_content_type(content_type: str | None) -> bool:
    if not content_type:
        return False
    ct = content_type.lower()
    return (
        "application/json" in ct
        or "text/" in ct
        or "application/javascript" in ct
        or "application/xml" in ct
        or "application/x-www-form-urlencoded" in ct
    )

@app.middleware("http")
async def log_http_traffic(request, call_next):
    start = time.perf_counter()
    path = request.url.path
    method = request.method.upper()
    client = getattr(request, "client", None)
    client_ip = getattr(client, "host", None)

    # Only log request/response bodies for invoice record endpoint
    log_body = (method == "POST" and path == "/api/invoice/record")

    req_body_bytes = b""
    if log_body:
        try:
            req_body_bytes = await request.body()
        except Exception:
            req_body_bytes = b"<unreadable>"

    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        if log_body:
            logger.exception(
                "HTTP %s %s crashed (%sms) client=%s request_body=%s",
                method,
                path,
                elapsed_ms,
                client_ip,
                _truncate_bytes(req_body_bytes).decode("utf-8", errors="replace"),
            )
        else:
            logger.exception("HTTP %s %s crashed (%sms) client=%s", method, path, elapsed_ms, client_ip)
        raise

    # FastAPI/Starlette response is already built; we can wrap the body by iterating it.
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    status = getattr(response, "status_code", None)
    content_type = response.headers.get("content-type")

    if not log_body:
        logger.info("HTTP %s %s -> %s (%sms) client=%s", method, path, status, elapsed_ms, client_ip)
        return response

    # Capture response body (best effort) for this endpoint only
    try:
        body_chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            body_chunks.append(chunk)
        body = b"".join(body_chunks)
        preview = _truncate_bytes(body).decode("utf-8", errors="replace") if _is_textual_content_type(content_type) else "<non-textual>"

        logger.info(
            "HTTP %s %s -> %s (%sms) client=%s request_body=%s response_body=%s",
            method,
            path,
            status,
            elapsed_ms,
            client_ip,
            _truncate_bytes(req_body_bytes).decode("utf-8", errors="replace"),
            preview,
        )

        return Response(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )
    except Exception:
        logger.exception("HTTP %s %s logging failed", method, path)
        return response

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    # NOTE: `allow_credentials=True` cannot be used with wildcard origins ("*").
    # Browsers will reject such responses, causing `fetch()` to fail with
    # "TypeError: Failed to fetch" even when the server responds.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(enquiry.router, prefix="/api/enquiry", tags=["Enquiry"])
app.include_router(pricing.router, prefix="/api/pricing", tags=["Pricing"])
app.include_router(workflow.router, prefix="/api/workflow", tags=["Workflow"])
app.include_router(port.router, prefix="/api/ports", tags=["Ports"])
app.include_router(exchange_rate.router, prefix="/api/exchange-rate", tags=["Exchange Rate"])
app.include_router(quote.router, prefix="/api", tags=["Quotes"])
app.include_router(tracking.router, prefix="/api", tags=["Tracking"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(client.router, prefix="/api/client", tags=["Client"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(invoice.router, prefix="/api", tags=["Invoice"])
app.include_router(finance.router, prefix="/api", tags=["Finance"])
app.include_router(shipping_line.router, prefix="/api/shipping-lines", tags=["Shipping Lines"])

@app.get("/api")
async def root():
    return {"message": "Welcome to Exim TMS API"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.get("/api/debug-routes")
async def debug_routes():
    routes = []
    for route in app.routes:
        routes.append({
            "path": route.path,
            "name": route.name,
            "methods": list(route.methods) if hasattr(route, 'methods') else []
        })
    return routes

# Serve uploads directory (configured in backend/config.py)
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve dynamic config
@app.get("/js/config.js")
async def serve_config_js():
    from backend.database import SessionLocal
    from backend.models.client_master import ClientMaster
    from backend.models.shipping_line import ShippingLine
    
    config_dict = get_frontend_config()
    
    # Get clients and shipping lines from Database
    try:
        db = SessionLocal()
        db_clients = db.query(ClientMaster.client_name).distinct().all()
        if db_clients:
            config_dict["clients"] = [c[0] for c in db_clients if c[0]]
        
        db_shipping_lines = db.query(ShippingLine.shipping_line_name).filter(ShippingLine.status == 'verified').distinct().all()
        if db_shipping_lines:
            config_dict["shippingLines"] = [s[0] for s in db_shipping_lines if s[0]]
            
        db.close()
    except Exception as e:
        logger.error(f"Error fetching data for config.js: {e}")
        # Keep the hardcoded ones as fallback

    # Same-origin relative API paths (/api/...) — never inject a different host than the page URL
    api_base_js = json.dumps(API_URL if API_URL else "")
    js_content = f"""
const CONFIG = {json.dumps(config_dict)};
CONFIG.API_URL = {api_base_js};
CONFIG.adminUsers = {json.dumps(ADMIN_USERS)};
"""
    return Response(content=js_content, media_type="application/javascript")

# Serve explicit frontend pages without .html
from fastapi import Request
from fastapi.responses import FileResponse

frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

@app.get("/login", include_in_schema=False)
@app.get("/enquiry", include_in_schema=False)
@app.get("/pricing", include_in_schema=False)
@app.get("/upload-track", include_in_schema=False)
@app.get("/finance-details", include_in_schema=False)
@app.get("/create-invoice", include_in_schema=False)
@app.get("/generate-hbl", include_in_schema=False)
@app.get("/hbl-document", include_in_schema=False)
@app.get("/client-master", include_in_schema=False)
@app.get("/shipping-line", include_in_schema=False)
@app.get("/record-payment", include_in_schema=False)
async def serve_frontend_pages(request: Request):
    page = request.url.path.strip("/")
    file_path = os.path.join(frontend_path, f"{page}.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return Response(status_code=404)

app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    # Use uvicorn.run for the app and enable reload for development
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
