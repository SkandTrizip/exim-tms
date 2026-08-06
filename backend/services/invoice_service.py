import re
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from backend.models.invoice import Invoice

INVOICE_PREFIX = "LPE"
# Continue after last manually issued LPE/26-27/000064
_FY_SEQUENCE_FLOORS: dict[str, int] = {"26-27": 65}


def financial_year_label(d: date) -> str:
    """Indian financial year label, e.g. April 2026 -> '26-27'."""
    if d.month >= 4:
        start_yy = d.year % 100
        end_yy = (d.year + 1) % 100
    else:
        start_yy = (d.year - 1) % 100
        end_yy = d.year % 100
    return f"{start_yy:02d}-{end_yy:02d}"


def get_next_invoice_number(
    db: Session,
    reference_date: Optional[date] = None,
) -> str:
    """
    Next invoice number in format LPE/YY-YY/NNNNNN.
    Sequence is per financial year (April–March).
    """
    ref = reference_date or datetime.utcnow().date()
    fy = financial_year_label(ref)
    prefix = f"{INVOICE_PREFIX}/{fy}/"
    rows = (
        db.query(Invoice.invoice_number)
        .filter(Invoice.invoice_number.like(f"{prefix}%"))
        .all()
    )
    pat = re.compile(rf"^{re.escape(INVOICE_PREFIX)}/{re.escape(fy)}/(\d+)")
    max_seq = 0
    for (num,) in rows:
        if not num or not isinstance(num, str):
            continue
        m = pat.match(num.strip())
        if m:
            max_seq = max(max_seq, int(m.group(1)))
    floor = _FY_SEQUENCE_FLOORS.get(fy, 1)
    next_seq = max(max_seq + 1, floor)
    return f"{prefix}{str(next_seq).zfill(6)}"


def allocate_invoice_number(db: Session, reference_date: date) -> str:
    """Allocate a unique invoice number, retrying if a concurrent insert took it."""
    for _ in range(10):
        candidate = get_next_invoice_number(db, reference_date)
        exists = (
            db.query(Invoice.id)
            .filter(Invoice.invoice_number == candidate)
            .first()
        )
        if not exists:
            return candidate
        db.expire_all()
    raise RuntimeError("Unable to allocate a unique invoice number")
