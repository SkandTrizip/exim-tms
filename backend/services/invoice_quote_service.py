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


def client_roe_for_currency(containers: List[Any], currency: str) -> Optional[float]:
    """
    Client ROE for a currency from On-Your-Account quote/final-quote lines.
    Prefers vendor (client) exchange rate used when invoicing.
    """
    curr = (currency or "INR").upper()
    if curr == "INR":
        return 1.0

    for container in containers or []:
        for charge in container.charges or []:
            if getattr(charge, "account_type", None) != "On Your Account":
                continue
            if (getattr(charge, "currency", None) or "INR").upper() != curr:
                continue
            roe = client_exchange_rate_for_invoice(charge)
            if roe is not None and roe > 0:
                return roe
    return None


def _usd_roe_from_containers(containers: List[Any]) -> float:
    roe = client_roe_for_currency(containers, "USD")
    if roe is None or roe <= 0:
        raise ValueError(
            "Missing client USD exchange rate. Set Client Ex. Rate on a USD line "
            "in the final quote before generating a USD invoice."
        )
    return roe


def invoice_line_amounts(
    charge,
    vendor_rate: float,
    containers: List[Any],
    currency_mode: Optional[str] = None,
) -> Tuple[float, float, float, str, float]:
    """
    Returns (rate_per_unit, curr_amt, roe_display, display_currency, taxable_amt)
    in the invoice presentation currency (INR default, or all-USD for dual clients).
    """
    mode = (currency_mode or "inr").strip().lower()
    qty = float(charge.quantity or 0)
    curr = (charge.currency or "INR").upper()

    if mode != "usd":
        curr_amt, roe_display, taxable_amt = taxable_inr_for_invoice_charge(
            charge, vendor_rate
        )
        return vendor_rate, curr_amt, roe_display, curr, taxable_amt

    if curr == "USD":
        curr_amt = vendor_rate * qty
        return vendor_rate, curr_amt, 1.0, "USD", curr_amt

    curr_amt_inr = vendor_rate * qty
    usd_roe = _usd_roe_from_containers(containers)
    rate_usd = vendor_rate / usd_roe
    curr_amt_usd = curr_amt_inr / usd_roe
    return rate_usd, curr_amt_usd, 1.0, "USD", curr_amt_usd


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


def additional_line_amounts(
    amount: float,
    currency: str,
    containers: List[Any],
    exchange_rate: Optional[float] = None,
    currency_mode: Optional[str] = None,
) -> Tuple[float, float, float, str, float]:
    """Same shape as invoice_line_amounts for additional invoice metadata rows."""
    mode = (currency_mode or "inr").strip().lower()
    curr = (currency or "INR").upper()
    curr_amt = float(amount or 0)

    if mode != "usd":
        curr_amt, roe_display, taxable_amt = taxable_inr_for_additional_amount(
            amount, currency, containers, exchange_rate=exchange_rate
        )
        return curr_amt, curr_amt, roe_display, curr, taxable_amt

    if curr == "USD":
        return curr_amt, curr_amt, 1.0, "USD", curr_amt

    usd_roe = _usd_roe_from_containers(containers)
    curr_amt_usd = curr_amt / usd_roe
    return curr_amt_usd, curr_amt_usd, 1.0, "USD", curr_amt_usd


def taxable_inr_for_additional_amount(
    amount: float,
    currency: str,
    containers: List[Any],
    exchange_rate: Optional[float] = None,
) -> Tuple[float, float, float]:
    """
    Convert additional-invoice amount to INR.
    Prefer explicit exchange_rate (ROE saved on the additional invoice);
    otherwise fall back to client ROE from quote/final-quote lines.
    Returns (curr_amt, roe_display, taxable_amt_inr).
    """
    curr = (currency or "INR").upper()
    curr_amt = float(amount or 0)
    if curr == "INR":
        return curr_amt, 1.0, curr_amt

    roe_display: Optional[float] = None
    if exchange_rate is not None:
        try:
            roe_val = float(exchange_rate)
        except (TypeError, ValueError):
            roe_val = 0.0
        if roe_val > 0:
            roe_display = round(roe_val, 2)

    if roe_display is None:
        roe_display = client_roe_for_currency(containers, curr)

    if roe_display is None:
        raise ValueError(
            f"Missing ROE for additional invoice ({curr}). "
            "Enter ROE when uploading the additional invoice, or set Client Ex. Rate "
            "on a matching currency line in the quote."
        )
    return curr_amt, roe_display, curr_amt * roe_display
