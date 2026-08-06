#!/usr/bin/env python3
"""
Import or update rows in the `invoices` table from a CSV file.

- Upsert key: `invoice_number` (default) or `id` (--match-by id)
- `created_at` is always set to today (UTC) on INSERT; preserved on UPDATE
- Empty CSV cells stay NULL in the database (not written as empty strings)
- `id` is never updated from CSV (only used to find existing rows when --match-by id)

Usage:
  python scripts/import_invoices.py invoices.csv
  python scripts/import_invoices.py invoices.csv --dry-run
  python scripts/import_invoices.py invoices.csv --match-by id

CSV columns (header row, case-insensitive; extra columns are ignored):
  enquiry_id, invoice_number, customer_invoice_no, invoice_date, place_of_supply,
  payment_due_date, irn, status, is_paid, payment_date, payment_type,
  payment_reference, received_amount, id

Date formats: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD-Mon-YYYY
Boolean (is_paid): true/false, yes/no, 1/0, paid/unpaid
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

# Project root on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.models.enquiry import Enquiry
from backend.models.invoice import Invoice

INVOICE_COLUMNS = {
    "enquiry_id",
    "invoice_number",
    "customer_invoice_no",
    "invoice_date",
    "place_of_supply",
    "payment_due_date",
    "irn",
    "status",
    "is_paid",
    "payment_date",
    "payment_type",
    "payment_reference",
    "received_amount",
    "id",
}

DATE_COLUMNS = {"invoice_date", "payment_due_date", "payment_date"}
BOOL_COLUMNS = {"is_paid"}
INT_COLUMNS = {"enquiry_id", "id"}
FLOAT_COLUMNS = {"received_amount"}

EMPTY_TOKENS = {"", "null", "none", "n/a", "na", "-"}


def normalize_header(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip().lower() in EMPTY_TOKENS:
        return True
    return False


def parse_date(value: str) -> date | None:
    value = value.strip()
    # US-style M/D/YYYY or MM/DD/YYYY (common in Excel exports)
    if "/" in value:
        parts = value.split("/")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
            if year < 100:
                year += 2000
            return date(year, month, day)

    formats = (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d-%b-%Y",
        "%d %b %Y",
        "%d-%b-%y",
        "%d %b %y",
    )
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date: {value!r}")


def parse_bool(value: str) -> bool | None:
    v = value.strip().lower()
    if v in {"true", "yes", "y", "1", "paid"}:
        return True
    if v in {"false", "no", "n", "0", "unpaid", "pending"}:
        return False
    raise ValueError(f"Unrecognised boolean: {value!r}")


def parse_row(raw: dict[str, str]) -> dict[str, Any]:
    row: dict[str, Any] = {}
    for key, value in raw.items():
        col = normalize_header(key)
        if col not in INVOICE_COLUMNS:
            continue
        if is_empty(value):
            row[col] = None
            continue

        text = value.strip() if isinstance(value, str) else value

        if col in DATE_COLUMNS:
            row[col] = parse_date(str(text))
        elif col in BOOL_COLUMNS:
            row[col] = parse_bool(str(text))
        elif col in INT_COLUMNS:
            row[col] = int(text)
        elif col in FLOAT_COLUMNS:
            row[col] = float(text)
        else:
            row[col] = str(text)

    return row


def load_csv(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row")
        rows = []
        for i, raw in enumerate(reader, start=2):
            try:
                rows.append(parse_row(raw))
            except (ValueError, TypeError) as e:
                raise ValueError(f"Row {i}: {e}") from e
        return rows


def validate_row(db, row: dict[str, Any], match_by: str) -> str | None:
    if match_by == "invoice_number":
        if not row.get("invoice_number"):
            return "invoice_number is required when matching by invoice_number"
    elif match_by == "id":
        if not row.get("id"):
            return "id is required when matching by id"
    else:
        return f"Invalid match_by: {match_by}"

    enquiry_id = row.get("enquiry_id")
    if enquiry_id is not None:
        exists = db.query(Enquiry.id).filter(Enquiry.id == enquiry_id).first()
        if not exists:
            return f"enquiry_id {enquiry_id} not found in enquiries"

    existing = find_existing(db, row, match_by) if match_by else None
    if existing is None:
        if not row.get("enquiry_id"):
            return "enquiry_id is required for new invoices"
        if not row.get("invoice_number"):
            return "invoice_number is required for new invoices"
    return None


def find_existing(db, row: dict[str, Any], match_by: str) -> Invoice | None:
    if match_by == "id" and row.get("id"):
        return db.query(Invoice).filter(Invoice.id == row["id"]).first()
    if row.get("invoice_number"):
        return db.query(Invoice).filter(Invoice.invoice_number == row["invoice_number"]).first()
    return None


def apply_row(existing: Invoice | None, row: dict[str, Any], today: datetime) -> Invoice:
    writable = {k: v for k, v in row.items() if k != "id"}

    if existing is None:
        inv = Invoice()
        inv.created_at = today
        for key, value in writable.items():
            setattr(inv, key, value)
        if inv.status is None:
            inv.status = "draft"
        if inv.is_paid is None:
            inv.is_paid = False
        return inv

    for key, value in writable.items():
        setattr(existing, key, value)
    return existing


def main() -> int:
    parser = argparse.ArgumentParser(description="Import/update invoices from CSV")
    parser.add_argument("csv_path", type=Path, help="Path to CSV file")
    parser.add_argument(
        "--match-by",
        choices=("invoice_number", "id"),
        default="invoice_number",
        help="Column used to find existing rows for update (default: invoice_number)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print actions without writing to the database",
    )
    args = parser.parse_args()

    if not args.csv_path.is_file():
        print(f"File not found: {args.csv_path}", file=sys.stderr)
        return 1

    try:
        rows = load_csv(args.csv_path)
    except ValueError as e:
        print(f"CSV error: {e}", file=sys.stderr)
        return 1

    if not rows:
        print("No data rows in CSV.")
        return 0

    today = datetime.now(timezone.utc)
    db = SessionLocal()
    inserted = updated = skipped = 0
    errors: list[str] = []

    try:
        for i, row in enumerate(rows, start=1):
            err = validate_row(db, row, args.match_by)
            if err:
                errors.append(f"Row {i}: {err}")
                skipped += 1
                continue

            existing = find_existing(db, row, args.match_by)
            action = "update" if existing else "insert"
            key = row.get("invoice_number") or row.get("id")

            if args.dry_run:
                print(f"[dry-run] {action} invoice {key!r}")
                if action == "insert":
                    inserted += 1
                else:
                    updated += 1
                continue

            inv = apply_row(existing, row, today)
            if existing is None:
                db.add(inv)
                inserted += 1
                print(f"Inserted invoice {inv.invoice_number!r} (enquiry_id={inv.enquiry_id})")
            else:
                updated += 1
                print(f"Updated invoice {existing.invoice_number!r} (id={existing.id})")

        if args.dry_run:
            print(f"\nDry run: would insert {inserted}, update {updated}, skip {skipped}")
            return 1 if errors else 0

        if errors:
            db.rollback()
            print("Rolled back — fix errors and retry.", file=sys.stderr)
            for e in errors:
                print(f"  {e}", file=sys.stderr)
            return 1

        db.commit()
        print(f"\nDone: inserted {inserted}, updated {updated}, skipped {skipped}")
        return 0

    except Exception as e:
        db.rollback()
        print(f"Failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
