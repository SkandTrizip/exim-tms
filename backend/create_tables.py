"""
Database Migration Script
Creates all tables for the Exim TMS application

Run this script to create/update database tables:
    python create_tables.py
"""

import sys
import os

# Add the project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import engine, Base
from backend.models import *  # Import all models

def create_tables():
    """Create all database tables"""
    print("Creating database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("✓ All tables created successfully!")
        print("\nCreated tables:")
        print("  - enquiries")
        print("  - pricing")
        print("  - quotes")
        print("  - quote_containers")
        print("  - quote_charges")
        print("  - ports")
        print("  - tracking")
        print("  - billing")
    except Exception as e:
        print(f"✗ Error creating tables: {e}")
        return False
    return True

if __name__ == "__main__":
    create_tables()
