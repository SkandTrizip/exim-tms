# ShipFlow - Freight Forwarding Management System

A modern, full-featured freight forwarding management system built with Python (FastAPI + PostgreSQL) backend and vanilla JavaScript frontend.

## 📁 Project Structure

```
exim-tms/
│
├── backend/                    # Python FastAPI Backend
│   ├── main.py                # Application entry point
│   ├── database.py            # Database configuration
│   │
│   ├── models/                # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── enquiry.py
│   │   ├── pricing.py
│   │   ├── tracking.py
│   │   └── billing.py
│   │
│   ├── schemas/               # Pydantic validation schemas
│   │   └── __init__.py
│   │
│   ├── routers/               # API route handlers
│   │   ├── __init__.py
│   │   ├── enquiry.py
│   │   ├── pricing.py
│   │   └── workflow.py
│   │
│   └── services/              # Business logic layer
│       ├── __init__.py
│       ├── enquiry_service.py
│       └── pricing_service.py
│
├── frontend/                   # Frontend Application
│   ├── index.html             # Main HTML file
│   │
│   ├── css/                   # Stylesheets
│   │   └── styles.css         # Main stylesheet
│   │
│   └── js/                    # JavaScript files
│       └── app.js             # Main application logic
│
└── requirements.txt           # Python dependencies
```

## 🚀 Getting Started

### Backend Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure PostgreSQL:**
   Update the database credentials in `backend/database.py` or set environment variables:
   ```bash
   set POSTGRES_USER=your_username
   set POSTGRES_PASSWORD=your_password
   set POSTGRES_DB=exim_tms
   set POSTGRES_HOST=localhost
   set POSTGRES_PORT=5432
   ```

3. **Run the backend server:**
   ```bash
   python backend/main.py
   ```
   
   The API will be available at `http://localhost:8000`

4. **Access API documentation:**
   - Interactive Swagger UI: `http://localhost:8000/docs`
   - ReDoc: `http://localhost:8000/redoc`

### Frontend Setup

1. **Open the application:**
   Simply open `frontend/index.html` in your web browser
   
   Or use a local server:
   ```bash
   cd frontend
   python -m http.server 3000
   ```
   
   Then navigate to `http://localhost:3000`

## 🎯 Features

### Backend (API)
- ✅ RESTful API with FastAPI
- ✅ PostgreSQL database integration
- ✅ SQLAlchemy ORM models
- ✅ Modular architecture (models, schemas, routers, services)
- ✅ Automatic API documentation

### Frontend
- ✅ Modern, responsive UI design
- ✅ Multi-stage workflow (Enquiry → Pricing → Tracking → Receipt → Invoice)
- ✅ Dashboard with statistics
- ✅ Dynamic form handling
- ✅ Clean separation of HTML, CSS, and JavaScript

## 🛠️ Technology Stack

### Backend
- **Python 3.x**
- **FastAPI** - Modern web framework
- **SQLAlchemy** - ORM for database operations
- **PostgreSQL** - Database
- **Uvicorn** - ASGI server
- **Pydantic** - Data validation

### Frontend
- **HTML5** - Structure
- **CSS3** - Styling (with CSS variables for theming)
- **Vanilla JavaScript** - No frameworks, just clean ES6+ code
- **Google Fonts** - IBM Plex Sans & JetBrains Mono

## 📝 API Endpoints

### Enquiry
- `POST /api/enquiry/` - Create new enquiry
- `GET /api/enquiry/` - List all enquiries

### Pricing
- `POST /api/pricing/calculate` - Calculate pricing

### Workflow
- `GET /api/workflow/status` - Get workflow status

## 🎨 Frontend Structure

### HTML (`index.html`)
Clean, semantic HTML structure with:
- Header with navigation
- Sidebar menu
- Main content area with multiple views
- 5-stage workflow system

### CSS (`css/styles.css`)
Organized sections:
- CSS Variables for theming
- Reset & base styles
- Component styles (buttons, forms, tables, etc.)
- Responsive design
- Animations

### JavaScript (`js/app.js`)
Well-organized code with:
- State management
- View navigation
- Form handling
- Data operations
- Table updates
- JSDoc comments for documentation

## 📄 License

This project is proprietary software for Exim TMS.

## 👥 Contributing

For development guidelines and contribution instructions, please contact the project maintainers.
