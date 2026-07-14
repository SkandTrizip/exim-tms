"""Sync enquiry_economics from final quote rates, additional invoices, and SOB date."""
from __future__ import annotations

import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from backend.models.document import ShipmentDocument
from backend.models.enquiry_economics import EnquiryEconomics
from backend.models.final_quote import FinalQuote, FinalQuoteContainer
from backend.models.shipment_status import ShipmentStatus
from backend.utils.logger import logger


def _charge_inr_amount(
    quantity: float,
    rate: float,
    currency: str,
    exchange_rate: float,
) -> float:
    if rate is None:
        return 0.0
    try:
        unit_rate = float(rate)
    except (TypeError, ValueError):
        return 0.0
    if unit_rate <= 0:
        return 0.0

    qty = float(quantity or 0)
    total = qty * unit_rate
    if (currency or "INR").upper() == "USD":
        return total * float(exchange_rate or 1.0)
    return total


def _load_final_quote_for_enquiry(db: Session, enquiry_id: int) -> Optional[FinalQuote]:
    return (
        db.query(FinalQuote)
        .options(
            joinedload(FinalQuote.containers).joinedload(FinalQuoteContainer.charges)
        )
        .filter(FinalQuote.enquiry_id == enquiry_id)
        .first()
    )


def _sum_final_quote_economics(final_quote: FinalQuote) -> Tuple[float, float]:
    """Shipping-line rate -> cost; client (vendor) rate -> revenue."""
    cost = 0.0
    revenue = 0.0

    for container in final_quote.containers or []:
        for charge in container.charges or []:
            if charge.account_type != "On Your Account":
                continue
            cost += _charge_inr_amount(
                charge.quantity,
                charge.rate,
                charge.currency,
                charge.exchange_rate,
            )
            revenue += _charge_inr_amount(
                charge.quantity,
                charge.vendor_rate,
                charge.currency,
                charge.vendor_exchange_rate or charge.exchange_rate,
            )

    return round(cost, 2), round(revenue, 2)


def _sum_additional_line_items_inr(db: Session, enquiry_id: int) -> float:
    """Additional invoice documents: same INR amount added to both cost and revenue."""
    docs = (
        db.query(ShipmentDocument)
        .filter(
            ShipmentDocument.enquiry_id == enquiry_id,
            ShipmentDocument.document_type == "additionalInvoice",
        )
        .all()
    )
    total = 0.0
    for doc in docs:
        metadata = doc.metadata_info or {}
        try:
            total += float(metadata.get("amount", 0) or 0)
        except (TypeError, ValueError):
            continue
    return round(total, 2)


def get_sob_date_for_enquiry(db: Session, enquiry_id: int) -> Optional[datetime.date]:
    """Return the SOB date from shipment_statuses, if set."""
    status = (
        db.query(ShipmentStatus)
        .filter(ShipmentStatus.enquiry_id == enquiry_id)
        .first()
    )
    if not status or not status.sob:
        return None
    sob = status.sob
    return sob.date() if isinstance(sob, datetime.datetime) else sob


def compute_enquiry_economics(db: Session, enquiry_id: int) -> Tuple[float, float]:
    cost = 0.0
    revenue = 0.0

    final_quote = _load_final_quote_for_enquiry(db, enquiry_id)
    if final_quote:
        quote_cost, quote_revenue = _sum_final_quote_economics(final_quote)
        cost += quote_cost
        revenue += quote_revenue

    additional = _sum_additional_line_items_inr(db, enquiry_id)
    cost += additional
    revenue += additional

    return round(cost, 2), round(revenue, 2)


def sync_enquiry_economics(
    db: Session,
    enquiry_id: int,
    *,
    commit: bool = False,
) -> Optional[EnquiryEconomics]:
    """
    Upsert enquiry_economics for an enquiry from final quote + additional line items.
    Also syncs sob_date from shipment_statuses.
    Skips when there is no final quote and no additional invoices.
    """
    final_quote = _load_final_quote_for_enquiry(db, enquiry_id)
    additional = _sum_additional_line_items_inr(db, enquiry_id)
    if not final_quote and additional <= 0:
        return None

    cost_inr, revenue_inr = compute_enquiry_economics(db, enquiry_id)
    sob_date = get_sob_date_for_enquiry(db, enquiry_id)
    now = datetime.datetime.utcnow()

    record = (
        db.query(EnquiryEconomics)
        .filter(EnquiryEconomics.enquiry_id == enquiry_id)
        .first()
    )
    if record is None:
        record = EnquiryEconomics(
            enquiry_id=enquiry_id,
            cost_inr=cost_inr,
            revenue_inr=revenue_inr,
            sob_date=sob_date,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
    else:
        record.cost_inr = cost_inr
        record.revenue_inr = revenue_inr
        record.sob_date = sob_date
        record.updated_at = now

    if commit:
        db.commit()
        db.refresh(record)

    logger.info(
        "Synced enquiry economics enquiry_id=%s cost_inr=%s revenue_inr=%s sob_date=%s",
        enquiry_id,
        cost_inr,
        revenue_inr,
        sob_date,
    )
    return record


def sync_enquiry_economics_sob_date(
    db: Session,
    enquiry_id: int,
    *,
    commit: bool = False,
) -> Optional[EnquiryEconomics]:
    """Update only sob_date on an existing economics row (or no-op if none)."""
    record = (
        db.query(EnquiryEconomics)
        .filter(EnquiryEconomics.enquiry_id == enquiry_id)
        .first()
    )
    if record is None:
        return None

    sob_date = get_sob_date_for_enquiry(db, enquiry_id)
    record.sob_date = sob_date
    record.updated_at = datetime.datetime.utcnow()

    if commit:
        db.commit()
        db.refresh(record)

    return record
