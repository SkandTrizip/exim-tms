import sys
import os
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

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Exim TMS API",
    description="Backend API for Exim Transport Management System",
    version="1.0.0"
)

logger.info("Starting Exim TMS API Application...")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
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
    
    config_dict = get_frontend_config()
    
    # Get clients from Database (Client Master)
    try:
        db = SessionLocal()
        db_clients = db.query(ClientMaster.client_name).distinct().all()
        if db_clients:
            config_dict["clients"] = [c[0] for c in db_clients if c[0]]
        db.close()
    except Exception as e:
        logger.error(f"Error fetching clients for config.js: {e}")
        # Keep the hardcoded ones as fallback

    js_content = f"""
const CONFIG = {json.dumps(config_dict)};
CONFIG.API_URL = '{API_URL}';
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
@app.get("/client-master", include_in_schema=False)
@app.get("/shipping-line", include_in_schema=False)
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
