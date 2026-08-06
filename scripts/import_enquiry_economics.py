#!/usr/bin/env python3
"""
Import or update rows in `enquiry_economics` from a CSV file.

- Upsert key: `enquiry_id` (one economics row per enquiry)
- `created_at` and `updated_at` are set to the same timestamp on every row (default: 2026-06-30 UTC)

Usage:
  python scripts/import_enquiry_economics.py enquiry_economics.csv
  python scripts/import_enquiry_economics.py enquiry_economics.csv --dry-run
  python scripts/import_enquiry_economics.py enquiry_economics.csv --as-of 2026-06-30

CSV columns (header row, case-insensitive; extra columns ignored):
  enquiry_id, cost_inr, revenue_inr
  Aliases: cost, revenue, enquiry id, sale id

You can also match by enquiry_number if enquiry_id is missing:
  enquiry_number, cost_inr, revenue_inr
"""

from __future__ import annotations

import argparse
import csv
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.models.enquiry import Enquiry
from backend.models.enquiry_economics import EnquiryEconomics

COLUMN_ALIASES = {
    "enquiry_id": "enquiry_id",
    "enquiryid": "enquiry_id",
    "enquiry": "enquiry_id",
    "sale_id": "enquiry_id",
    "id": "enquiry_id",
    "enquiry_number": "enquiry_number",
    "enquirynumber": "enquiry_number",
    "sale": "enquiry_number",
    "sale_#": "enquiry_number",
    "sale_no": "enquiry_number",
    "cost_inr": "cost_inr",
    "cost": "cost_inr",
    "total_cost": "cost_inr",
    "total_cost_inr": "cost_inr",
    "revenue_inr": "revenue_inr",
    "revenue": "revenue_inr",
    "total_revenue": "revenue_inr",
    "total_revenue_inr": "revenue_inr",
}

FLOAT_COLUMNS = {"cost_inr", "revenue_inr"}
INT_COLUMNS = {"enquiry_id"}
EMPTY_TOKENS = {"", "null", "none", "n/a", "na", "-"}


def normalize_header(name: str) -> str:
    key = name.strip().lower().replace(" ", "_")
    return COLUMN_ALIASES.get(key, key)


def is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip().lower() in EMPTY_TOKENS:
        return True
    return False


def parse_float(value: str) -> float:
    text = value.strip().replace(",", "")
    return float(text)


def parse_row(raw: dict[str, str]) -> dict[str, Any]:
    row: dict[str, Any] = {}
    for key, value in raw.items():
        col = normalize_header(key)
        if col not in {"enquiry_id", "enquiry_number", "cost_inr", "revenue_inr"}:
            continue
        if is_empty(value):
            row[col] = None
            continue
        text = value.strip() if isinstance(value, str) else value
        if col in INT_COLUMNS:
            row[col] = int(str(text).replace(",", ""))
        elif col in FLOAT_COLUMNS:
            row[col] = parse_float(str(text))
        else:
            row[col] = str(text).strip()
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


def parse_as_of(value: str) -> datetime:
    text = value.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            d = datetime.strptime(text, fmt).date()
            return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date: {value!r} (use YYYY-MM-DD)")


def resolve_enquiry_id(db, row: dict[str, Any]) -> int | None:
    if row.get("enquiry_id") is not None:
        return int(row["enquiry_id"])
    number = row.get("enquiry_number")
    if not number:
        return None
    enquiry = db.query(Enquiry.id).filter(Enquiry.enquiry_number == number).first()
    return enquiry[0] if enquiry else None


def validate_row(db, row: dict[str, Any]) -> str | None:
    enquiry_id = resolve_enquiry_id(db, row)
    if enquiry_id is None:
        if row.get("enquiry_number"):
            return f"enquiry_number {row['enquiry_number']!r} not found"
        return "enquiry_id or enquiry_number is required"

    exists = db.query(Enquiry.id).filter(Enquiry.id == enquiry_id).first()
    if not exists:
        return f"enquiry_id {enquiry_id} not found in enquiries"

    if row.get("cost_inr") is None:
        return "cost_inr is required"
    if row.get("revenue_inr") is None:
        return "revenue_inr is required"
    return None


def apply_row(
    db,
    row: dict[str, Any],
    stamp: datetime,
) -> tuple[EnquiryEconomics, str]:
    enquiry_id = resolve_enquiry_id(db, row)
    assert enquiry_id is not None

    existing = (
        db.query(EnquiryEconomics)
        .filter(EnquiryEconomics.enquiry_id == enquiry_id)
        .first()
    )

    if existing is None:
        record = EnquiryEconomics(
            enquiry_id=enquiry_id,
            cost_inr=row["cost_inr"],
            revenue_inr=row["revenue_inr"],
            created_at=stamp,
            updated_at=stamp,
        )
        return record, "insert"

    existing.cost_inr = row["cost_inr"]
    existing.revenue_inr = row["revenue_inr"]
    existing.created_at = stamp
    existing.updated_at = stamp
    return existing, "update"


def main() -> int:
    parser = argparse.ArgumentParser(description="Import enquiry economics from CSV")
    parser.add_argument("csv_path", type=Path, help="Path to CSV file")
    parser.add_argument(
        "--as-of",
        default="2026-06-30",
        help="Set created_at and updated_at to this date for all rows (default: 2026-06-30)",
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
        stamp = parse_as_of(args.as_of)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if not rows:
        print("No data rows in CSV.")
        return 0

    db = SessionLocal()
    inserted = updated = skipped = 0
    errors: list[str] = []

    try:
        for i, row in enumerate(rows, start=1):
            err = validate_row(db, row)
            if err:
                errors.append(f"Row {i}: {err}")
                skipped += 1
                continue

            enquiry_id = resolve_enquiry_id(db, row)
            if args.dry_run:
                existing = (
                    db.query(EnquiryEconomics)
                    .filter(EnquiryEconomics.enquiry_id == enquiry_id)
                    .first()
                )
                action = "update" if existing else "insert"
                print(
                    f"[dry-run] {action} enquiry_id={enquiry_id} "
                    f"cost={row['cost_inr']} revenue={row['revenue_inr']} "
                    f"created_at=updated_at={stamp.date().isoformat()}"
                )
                if action == "insert":
                    inserted += 1
                else:
                    updated += 1
                continue

            record, action = apply_row(db, row, stamp)
            if action == "insert":
                db.add(record)
                inserted += 1
                print(
                    f"Inserted enquiry_id={record.enquiry_id} "
                    f"cost={record.cost_inr} revenue={record.revenue_inr}"
                )
            else:
                updated += 1
                print(
                    f"Updated enquiry_id={record.enquiry_id} "
                    f"cost={record.cost_inr} revenue={record.revenue_inr}"
                )

        if args.dry_run:
            print(
                f"\nDry run: would insert {inserted}, update {updated}, skip {skipped} "
                f"(timestamps: {stamp.isoformat()})"
            )
            return 1 if errors else 0

        if errors:
            db.rollback()
            print("Rolled back — fix errors and retry.", file=sys.stderr)
            for e in errors:
                print(f"  {e}", file=sys.stderr)
            return 1

        db.commit()
        print(
            f"\nDone: inserted {inserted}, updated {updated}, skipped {skipped} "
            f"(created_at & updated_at = {stamp.date().isoformat()})"
        )
        return 0

    except Exception as e:
        db.rollback()
        print(f"Failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
