
import sys
import os
from datetime import datetime

# Add the project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models.client_origin import ClientOrigin
from backend.models.client_master import ClientMaster

def seed_data():
    db = SessionLocal()
    try:
        print("Seeding Client Origin and Master data with full details...")
        
        # 1. Dummy Client Origins
        origin_data = [
            {
                "group_client": "Reliance Industries",
                "unique_client_name": "Reliance Industries Ltd",
                "office_location": "Mumbai",
                "office_address": "Reliance Corporate Park, Navi Mumbai",
                "gst_no": "27AAACR0000A1Z1",
                "gst_address": "Navi Mumbai, Maharashtra",
                "country": "India",
                "pin_code": "400701",
                "contact_person": "Rajesh Mehta",
                "contact_no": "9820012345",
                "email_id": "rajesh.mehta@ril.com",
                "commodity": "Petrochemicals",
                "sales_branch": "Mumbai Main",
                "sales_person": "Amit Shah",
                "cs_name": "Priya Singh",
                "contact_person_logistics": "Manish Shah",
                "contact_no_logistics": "9820054321",
                "email_id_logistics": "manish.log@ril.com",
                "contact_person_finance": "Karan Jain",
                "contact_no_finance": "9820067890",
                "email_id_finance": "karan.fin@ril.com"
            },
            {
                "group_client": "Tata Group",
                "unique_client_name": "Tata Motors Ltd",
                "office_location": "Pune",
                "office_address": "Pimpri, Pune",
                "gst_no": "27AAACT0000B1Z2",
                "gst_address": "Pimpri, Pune, Maharashtra",
                "country": "India",
                "pin_code": "411018",
                "contact_person": "Suresh Prabhu",
                "contact_no": "9819954321",
                "email_id": "suresh.p@tatamotors.com",
                "commodity": "Automotive parts",
                "sales_branch": "Pune West",
                "sales_person": "Vikram Rao",
                "cs_name": "Anjali Gupta",
                "contact_person_logistics": "Sanjay Dutt",
                "contact_no_logistics": "9819965432",
                "email_id_logistics": "sanjay.log@tatamotors.com",
                "contact_person_finance": "Rahul Bose",
                "contact_no_finance": "9819976543",
                "email_id_finance": "rahul.fin@tatamotors.com"
            }
        ]

        for data in origin_data:
            origin = db.query(ClientOrigin).filter(ClientOrigin.unique_client_name == data["unique_client_name"]).first()
            if not origin:
                origin = ClientOrigin(**data)
                db.add(origin)
                print(f"Added origin: {data['unique_client_name']}")
            else:
                for key, value in data.items():
                    setattr(origin, key, value)
                print(f"Updated origin: {data['unique_client_name']}")
            
            db.flush() # Secure ID for Master linkage

            # 2. Dummy Client Masters (Branches)
            if data["unique_client_name"] == "Reliance Industries Ltd":
                branches = [
                    {
                        "origin_id": origin.id,
                        "client_code": "RIL-MUM",
                        "client_name": "Reliance Industries - Mumbai Branch",
                        "gst_name": "Reliance Industries Ltd (Mumbai)",
                        "gst_no": "27AAACR0000A1Z1",
                        "pan_no": "AAACR0000A",
                        "iec_code": "0102030405",
                        "co_registration_type": "Private Ltd",
                        "office_location": "Navi Mumbai",
                        "office_address": "Sector 11, CBD Belapur",
                        "country": "India",
                        "pin_code": "400614",
                        "contact_person": "Rahul Khanna",
                        "contact_no": "9988776655",
                        "email_id": "khanna@ril.com",
                        "client_type_category": "Enterprise",
                        "business_nature": "Manufacturing",
                        "industry_type": "Electronics",
                        "shipment_type": "FCL",
                        "contract_type": "Fixed",
                        "billing_method": "FCM",
                        "gst_percent": "18%",
                        "billing_type": "Neft",
                        "payment_terms": "Credit",
                        "credit_amount": 500000,
                        "credit_period": 30,
                        "created_by": "Admin"
                    },
                    {
                        "origin_id": origin.id,
                        "client_code": "RIL-GUJ",
                        "client_name": "Reliance Industries - Jamnagar",
                        "gst_name": "Reliance Industries Ltd (Gujarat)",
                        "gst_no": "24AAACR0000A1Z2",
                        "pan_no": "AAACR0000A",
                        "iec_code": "0102030405",
                        "co_registration_type": "Private Ltd",
                        "office_location": "Jamnagar",
                        "office_address": "Village Digvijaygram, Jamnagar",
                        "country": "India",
                        "pin_code": "361140",
                        "contact_person": "Bharat Patel",
                        "contact_no": "9123456789",
                        "email_id": "patel@ril.com",
                        "client_type_category": "Enterprise",
                        "business_nature": "Manufacturing",
                        "industry_type": "Pharma",
                        "shipment_type": "LCL",
                        "contract_type": "Fixed",
                        "billing_method": "FCM",
                        "gst_percent": "18%",
                        "billing_type": "Neft",
                        "payment_terms": "Against BL",
                        "created_by": "Admin"
                    }
                ]
            else:
                branches = [
                    {
                        "origin_id": origin.id,
                        "client_code": "TATA-PUNE",
                        "client_name": "Tata Motors - Pune Factory",
                        "gst_name": "Tata Motors Ltd (Pune)",
                        "gst_no": "27AAACT0000B1Z2",
                        "pan_no": "AAACT0000B",
                        "iec_code": "0506070809",
                        "co_registration_type": "Private Ltd",
                        "office_location": "Pimpri",
                        "office_address": "Tata Motors Campus, Pune",
                        "country": "India",
                        "pin_code": "411018",
                        "contact_person": "Anand Shinde",
                        "contact_no": "8877665544",
                        "email_id": "shinde@tatamotors.com",
                        "client_type_category": "Enterprise",
                        "business_nature": "Manufacturing",
                        "industry_type": "Electronics",
                        "shipment_type": "AIR",
                        "contract_type": "Fixed",
                        "billing_method": "RCM",
                        "gst_percent": "5%",
                        "billing_type": "Cheque",
                        "payment_terms": "Credit",
                        "credit_amount": 1000000,
                        "credit_period": 45,
                        "created_by": "Admin"
                    }
                ]

            for branch_data in branches:
                master = db.query(ClientMaster).filter(ClientMaster.client_code == branch_data["client_code"]).first()
                if not master:
                    master = ClientMaster(**branch_data)
                    db.add(master)
                    print(f"Added branch: {branch_data['client_name']}")
                else:
                    for key, value in branch_data.items():
                        setattr(master, key, value)
                    print(f"Updated branch: {branch_data['client_name']}")

        db.commit()
        print("✓ Comprehensive dummy data seeding completed!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
