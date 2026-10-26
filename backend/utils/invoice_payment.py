"""Client payment received — date is the source of truth; UTR/reference is optional."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional


def is_payment_received(invoice: Any) -> bool:
    """True when payment has been received (date recorded), regardless of UTR."""
    if invoice is None:
        return False
    if getattr(invoice, "payment_date", None):
        return True
    if isinstance(invoice, dict):
        if invoice.get("payment_date"):
            return True
        return bool(invoice.get("is_paid"))
    return bool(getattr(invoice, "is_paid", False))


def payment_received_date(invoice: Any) -> Optional[date]:
    if invoice is None:
        return None
    if isinstance(invoice, dict):
        return invoice.get("payment_date")
    return getattr(invoice, "payment_date", None)
