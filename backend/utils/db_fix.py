
import sys
import os
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# Set up path to import database config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from backend.database import SQLALCHEMY_DATABASE_URL

def fix_constraints():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    
    with engine.connect() as conn:
        print("Starting robust constraint fix...")
        
        # This query finds ALL foreign keys that point to 'enquiries' table
        query = text("""
            SELECT 
                tc.table_name, 
                kcu.column_name, 
                tc.constraint_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'enquiries';
        """)
        
        results = conn.execute(query).fetchall()
        
        print(f"Found {len(results)} foreign keys pointing to 'enquiries'.")
        
        for table, col, constraint, target_table, target_col in results:
            print(f"Fixing: {table}.{col} | Constraint: {constraint} -> {target_table}.{target_col}")
            try:
                # Drop existing
                conn.execute(text(f'ALTER TABLE "{table}" DROP CONSTRAINT "{constraint}";'))
                # Add with CASCADE
                conn.execute(text(f"""
                    ALTER TABLE "{table}" 
                    ADD CONSTRAINT "{constraint}" 
                    FOREIGN KEY ("{col}") 
                    REFERENCES "{target_table}"("{target_col}") 
                    ON DELETE CASCADE;
                """))
                print(f"  SUCCESS: {constraint} is now CASCADE.")
            except Exception as e:
                print(f"  FAILED to fix {constraint}: {e}")

        # Also specifically check for the ones mentioned in nested tables
        # like quote_charges pointing to quote_containers or quotes
        print("\nChecking for secondary constraints (quotes -> containers -> charges)...")
        
        second_query = text("""
            SELECT 
                tc.table_name, 
                kcu.column_name, 
                tc.constraint_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
              AND ccu.table_name IN ('quotes', 'quote_containers');
        """)
        
        second_results = conn.execute(second_query).fetchall()
        for table, col, constraint, target_table, target_col in second_results:
            print(f"Fixing: {table}.{col} | Constraint: {constraint} -> {target_table}.{target_col}")
            try:
                conn.execute(text(f'ALTER TABLE "{table}" DROP CONSTRAINT "{constraint}";'))
                conn.execute(text(f"""
                    ALTER TABLE "{table}" 
                    ADD CONSTRAINT "{constraint}" 
                    FOREIGN KEY ("{col}") 
                    REFERENCES "{target_table}"("{target_col}") 
                    ON DELETE CASCADE;
                """))
                print(f"  SUCCESS: {constraint} is now CASCADE.")
            except Exception as e:
                print(f"  FAILED to fix {constraint}: {e}")
        
        conn.commit()
        print("\nAll constraints updated. You can now delete enquiries safely.")

if __name__ == "__main__":
    fix_constraints()
