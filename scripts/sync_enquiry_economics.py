#!/usr/bin/env python3
"""
Backfill enquiry_economics from final quotes and additional invoice line items.

Usage:
  python scripts/sync_enquiry_economics.py
  python scripts/sync_enquiry_economics.py --enquiry-id 42
  python scripts/sync_enquiry_economics.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.services.enquiry_economics_service import compute_enquiry_economics, sync_enquiry_economics


def enquiry_ids_to_sync(db, enquiry_id: int | None) -> list[int]:
    if enquiry_id is not None:
        return [enquiry_id]

    from backend.services.enquiry_economics_service import eligible_enquiry_ids_for_economics

    return eligible_enquiry_ids_for_economics(db)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync enquiry economics from final quotes")
    parser.add_argument("--enquiry-id", type=int, help="Sync a single enquiry")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    db = SessionLocal()
    synced = skipped = 0
    try:
        ids = enquiry_ids_to_sync(db, args.enquiry_id)
        if not ids:
            print("No enquiries with final quotes or additional invoices found.")
            return 0

        for eid in ids:
            cost, revenue = compute_enquiry_economics(db, eid)
            if args.dry_run:
                print(f"[dry-run] enquiry_id={eid} cost_inr={cost} revenue_inr={revenue}")
                synced += 1
                continue

            record = sync_enquiry_economics(db, eid, commit=True)
            if record:
                print(
                    f"Synced enquiry_id={eid} cost_inr={record.cost_inr} "
                    f"revenue_inr={record.revenue_inr}"
                )
                synced += 1
            else:
                skipped += 1

        print(f"\nDone: synced {synced}, skipped {skipped}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
