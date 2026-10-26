#!/usr/bin/env python3
"""
Apply payment received dates from invoice_exim-style CSV to TMS invoices.

CSV columns (header names are flexible; matched case-insensitively):
  Invoice No.              → match invoices.invoice_number
  Payment Rcvd Date        → payment_date, is_paid=true
  Telex Invoice No.        → second invoice row (telex / separate tax invoice)
  Telex Payment Rcvd Date  → payment_date for telex invoice

Optional columns (invoice_date only updated if --update-invoice-dates):
  Invoicing Date, Telex Invoice Date

Usage:
  python scripts/import_exim_invoice_payments.py invoice_exim.csv --dry-run
  python scripts/import_exim_invoice_payments.py invoice_exim.csv
  python scripts/import_exim_invoice_payments.py invoice_exim.csv --skip-existing
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
from pathlib import Path
from typing import Any, Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import SessionLocal
from backend.models.invoice import Invoice
from backend.models.shipment_status import ShipmentStatus

EMPTY = {"", "-", "n/a", "na", "null", "none"}


def canonical_csv_column(name: str) -> str:
    """Excel headers like 'Invoice No.' → invoice_no."""
    s = re.sub(r"\s+", " ", (name or "").strip().lower())
    s = s.replace(".", "").replace(" ", "_")
    return s


HEADER_ALIASES = {
    "invoice_no": "invoice_no",
    "invoicing_date": "invoicing_date",
    "payment_rcvd_date": "payment_rcvd_date",
    "telex_invoice_no": "telex_invoice_no",
    "telex_invoice_date": "telex_invoice_date",
    "telex_payment_rcvd_date": "telex_payment_rcvd_date",
}


def parse_date(value: str) -> dt.date | None:
    if not value or value.strip().lower() in EMPTY:
        return None
    value = value.strip()
    if "/" in value:
        parts = value.split("/")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
            if year < 100:
                year += 2000
            return dt.date(year, month, day)
    for fmt in (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d-%b-%Y",
        "%d %b %Y",
    ):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date: {value!r}")


def normalize_invoice_number(raw: str) -> str:
    """Canonical form for lookup: LPE/26-27/000069, EX/25-26/00001."""
    s = (raw or "").strip()
    if not s:
        return ""

    # Collapse accidental spaces
    s = re.sub(r"\s+", "", s)

    # LPE26-27000069 → LPE/26-27/000069
    m = re.match(r"^LPE(\d{2})-(\d{2})(\d+)$", s, re.I)
    if m:
        seq = m.group(3).zfill(6)
        return f"LPE/{m.group(1)}-{m.group(2)}/{seq}"

    # LPE/26-27/69 → pad sequence
    m = re.match(r"^(LPE)/(\d{2}-\d{2})/(\d+)$", s, re.I)
    if m:
        return f"{m.group(1).upper()}/{m.group(2)}/{m.group(3).zfill(6)}"

    m = re.match(r"^(EX)/(\d{2}-\d{2})/(\d+)$", s, re.I)
    if m:
        return f"{m.group(1).upper()}/{m.group(2)}/{m.group(3).zfill(5)}"

    return s


def map_row(raw: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, val in raw.items():
        nk = canonical_csv_column(key)
        canon = HEADER_ALIASES.get(nk, nk)
        out[canon] = (val or "").strip()
    return out


def payment_entries_from_row(row: dict[str, str]) -> list[tuple[str, dt.date | None, dt.date | None]]:
    """
    Returns list of (invoice_number, payment_date, optional_invoice_date).
    Skips rows without both number and payment date.
    """
    entries: list[tuple[str, dt.date | None, dt.date | None]] = []

    inv_no = normalize_invoice_number(row.get("invoice_no", ""))
    pay_raw = row.get("payment_rcvd_date", "")
    inv_date_raw = row.get("invoicing_date", "")

    if inv_no and pay_raw and pay_raw.lower() not in EMPTY:
        entries.append(
            (inv_no, parse_date(pay_raw), parse_date(inv_date_raw) if inv_date_raw else None)
        )

    telex_no = normalize_invoice_number(row.get("telex_invoice_no", ""))
    telex_pay = row.get("telex_payment_rcvd_date", "")
    telex_inv_date = row.get("telex_invoice_date", "")

    if telex_no and telex_pay and telex_pay.lower() not in EMPTY:
        entries.append(
            (
                telex_no,
                parse_date(telex_pay),
                parse_date(telex_inv_date) if telex_inv_date else None,
            )
        )

    return entries


def find_invoice(db, number: str) -> Invoice | None:
    if not number:
        return None
    inv = db.query(Invoice).filter(Invoice.invoice_number == number).first()
    if inv:
        return inv
    # Case-insensitive fallback
    inv = (
        db.query(Invoice)
        .filter(Invoice.invoice_number.ilike(number))
        .first()
    )
    return inv


def sync_shipment_client_payment(db, enquiry_id: int, payment_date: dt.date) -> None:
    status = (
        db.query(ShipmentStatus)
        .filter(ShipmentStatus.enquiry_id == enquiry_id)
        .first()
    )
    if not status:
        return
    status.pay_client = dt.datetime.combine(payment_date, dt.time.min)


def apply_payment(
    db,
    inv: Invoice,
    payment_date: dt.date,
    *,
    skip_existing: bool,
    update_invoice_dates: bool,
    invoice_date: dt.date | None,
    dry_run: bool,
) -> str:
    if skip_existing and inv.is_paid and inv.payment_date:
        return "skipped_existing"

    if dry_run:
        return "would_update"

    inv.is_paid = True
    inv.payment_date = payment_date
    if not inv.payment_type:
        inv.payment_type = "Imported"
    if not inv.payment_reference:
        inv.payment_reference = "exim-csv-import"
    if update_invoice_dates and invoice_date and not inv.invoice_date:
        inv.invoice_date = invoice_date

    sync_shipment_client_payment(db, inv.enquiry_id, payment_date)
    return "updated"


def load_csv(path: Path) -> Iterable[tuple[int, dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row")
        for i, raw in enumerate(reader, start=2):
            yield i, map_row(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description="Import payment dates from invoice_exim CSV")
    parser.add_argument("csv_path", type=Path, help="Path to invoice_exim.csv")
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Do not overwrite invoices that already have payment_date",
    )
    parser.add_argument(
        "--update-invoice-dates",
        action="store_true",
        help="Set invoice_date from CSV when DB value is empty",
    )
    args = parser.parse_args()

    if not args.csv_path.is_file():
        print(f"File not found: {args.csv_path}", file=sys.stderr)
        return 1

    stats = {
        "updated": 0,
        "would_update": 0,
        "skipped_existing": 0,
        "not_found": 0,
        "parse_errors": 0,
        "payment_lines": 0,
    }
    not_found: list[str] = []
    errors: list[str] = []

    db = SessionLocal()
    try:
        for row_num, row in load_csv(args.csv_path):
            try:
                entries = payment_entries_from_row(row)
            except ValueError as e:
                errors.append(f"Row {row_num}: {e}")
                stats["parse_errors"] += 1
                continue

            for inv_no, pay_date, inv_date in entries:
                if pay_date is None:
                    continue
                stats["payment_lines"] += 1
                inv = find_invoice(db, inv_no)
                if not inv:
                    stats["not_found"] += 1
                    not_found.append(inv_no)
                    continue

                action = apply_payment(
                    db,
                    inv,
                    pay_date,
                    skip_existing=args.skip_existing,
                    update_invoice_dates=args.update_invoice_dates,
                    invoice_date=inv_date,
                    dry_run=args.dry_run,
                )
                stats[action] = stats.get(action, 0) + 1
                if action in ("updated", "would_update"):
                    print(
                        f"{'[dry-run] ' if args.dry_run else ''}"
                        f"{inv_no} → payment_date={pay_date.isoformat()} "
                        f"(id={inv.id}, enquiry_id={inv.enquiry_id})"
                    )

        if args.dry_run:
            db.rollback()
        else:
            if errors:
                db.rollback()
                for e in errors:
                    print(e, file=sys.stderr)
                return 1
            db.commit()

        print(
            f"\nSummary: payment_lines={stats.get('payment_lines', 0)}, "
            f"updated={stats.get('updated', 0)}, "
            f"would_update={stats.get('would_update', 0)}, "
            f"skipped_existing={stats.get('skipped_existing', 0)}, "
            f"not_found={stats.get('not_found', 0)}, "
            f"parse_errors={stats.get('parse_errors', 0)}"
        )
        if stats.get("payment_lines", 0) == 0:
            print(
                "\nNo payment rows were read from the CSV. "
                "Check column headers (Invoice No., Payment Rcvd Date, …).",
                file=sys.stderr,
            )
        if not_found:
            unique = sorted(set(not_found))
            print(f"\nInvoice numbers not in DB ({len(unique)}):")
            for num in unique[:40]:
                print(f"  {num}")
            if len(unique) > 40:
                print(f"  … and {len(unique) - 40} more")

        return 0 if stats.get("parse_errors", 0) == 0 else 1
    except Exception as e:
        db.rollback()
        print(f"Failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
