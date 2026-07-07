"""Resolve client-invoice charge lines — final quote preferred over accepted source quote."""
from __future__ import annotations

from typing import Optional, Tuple, List, Any

from sqlalchemy.orm import Session, joinedload

from backend.models.final_quote import FinalQuote, FinalQuoteContainer
from backend.models.quote import Quote, QuoteContainer


def _load_final_quote(db: Session, enquiry_id: int) -> Optional[FinalQuote]:
    return (
        db.query(FinalQuote)
        .options(joinedload(FinalQuote.containers).joinedload(FinalQuoteContainer.charges))
        .filter(FinalQuote.enquiry_id == enquiry_id)
        .first()
    )


def _load_accepted_quote(db: Session, enquiry_id: int) -> Optional[Quote]:
    quote = (
        db.query(Quote)
        .filter(Quote.enquiry_id == enquiry_id, Quote.status == "accepted")
        .first()
    )
    if not quote:
        quote = (
            db.query(Quote)
            .filter(Quote.enquiry_id == enquiry_id)
            .order_by(Quote.created_at.desc())
            .first()
        )
    if not quote:
        return None
    return (
        db.query(Quote)
        .options(joinedload(Quote.containers).joinedload(QuoteContainer.charges))
        .filter(Quote.id == quote.id)
        .first()
    )


def get_invoice_charge_containers(
    db: Session, enquiry_id: int
) -> Tuple[List[Any], Optional[str]]:
    """
    Return (containers, source) for invoice line items.
    source is 'final' when a post-SI final quote exists, else 'accepted'.
    """
    final = _load_final_quote(db, enquiry_id)
    if final and final.containers:
        return list(final.containers), "final"

    quote = _load_accepted_quote(db, enquiry_id)
    if quote and quote.containers:
        return list(quote.containers), "accepted"

    return [], None


def client_rate_for_invoice(charge) -> Optional[float]:
    """Client rate (vendor_rate) only — no shipping-line fallback."""
    if charge.vendor_rate is None:
        return None
    try:
        rate = float(charge.vendor_rate)
    except (TypeError, ValueError):
        return None
    if rate <= 0:
        return None
    return rate


def client_exchange_rate_for_invoice(charge) -> Optional[float]:
    """Per-line client ROE from quote: vendor_exchange_rate, then exchange_rate."""
    curr = (charge.currency or "INR").upper()
    if curr == "INR":
        return 1.0
    for attr in ("vendor_exchange_rate", "exchange_rate"):
        raw = getattr(charge, attr, None)
        if raw is None:
            continue
        try:
            val = float(raw)
        except (TypeError, ValueError):
            continue
        if val > 0:
            return round(val, 2)
    return None


def taxable_inr_for_invoice_charge(
    charge,
    vendor_rate: float,
) -> Tuple[float, float, float]:
    """Returns (curr_amt, roe_display, taxable_amt_inr)."""
    qty = float(charge.quantity or 0)
    curr = (charge.currency or "INR").upper()
    curr_amt = vendor_rate * qty
    if curr != "INR":
        roe_display = client_exchange_rate_for_invoice(charge)
        if roe_display is None:
            label = charge.charge_description or "charge"
            raise ValueError(
                f"Missing client exchange rate for “{label}” ({curr}). "
                "Set Client Ex. Rate on the final quote before generating the invoice."
            )
        taxable_amt = curr_amt * roe_display
    else:
        roe_display = 1.0
        taxable_amt = curr_amt
    return curr_amt, roe_display, taxable_amt
