"""Sync enquiry_economics from quote rates, additional invoices, and SOB date."""
from __future__ import annotations

import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from backend.models.document import ShipmentDocument
from backend.models.enquiry_economics import EnquiryEconomics
from backend.models.final_quote import FinalQuote, FinalQuoteContainer
from backend.models.quote import Quote, QuoteContainer
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


def _client_exchange_rate(currency: str, exchange_rate: float, vendor_exchange_rate) -> float:
    """
    ROE for client (vendor) INR amount.
    Ignores placeholder vendor_exchange_rate=1.0 on non-INR lines when a real shipping-line ROE exists.
    """
    curr = (currency or "INR").upper()
    if curr == "INR":
        return 1.0

    line_ex = float(exchange_rate or 1.0)
    if vendor_exchange_rate is None:
        return line_ex
    try:
        vex = float(vendor_exchange_rate)
    except (TypeError, ValueError):
        return line_ex
    if vex <= 0:
        return line_ex
    # Common bad data: vendor_exchange_rate stored as 1.0 on USD lines
    if vex == 1.0 and line_ex != 1.0:
        return line_ex
    return vex


def _sum_container_charges_economics(containers) -> Tuple[float, float]:
    """Shipping-line rate -> cost; client (vendor) rate -> revenue."""
    cost = 0.0
    revenue = 0.0

    for container in containers or []:
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
                _client_exchange_rate(
                    charge.currency,
                    charge.exchange_rate,
                    getattr(charge, "vendor_exchange_rate", None),
                ),
            )

    return round(cost, 2), round(revenue, 2)


def _load_final_quote_for_enquiry(db: Session, enquiry_id: int) -> Optional[FinalQuote]:
    return (
        db.query(FinalQuote)
        .options(
            joinedload(FinalQuote.containers).joinedload(FinalQuoteContainer.charges)
        )
        .filter(FinalQuote.enquiry_id == enquiry_id)
        .first()
    )


def _load_accepted_quote_for_enquiry(db: Session, enquiry_id: int) -> Optional[Quote]:
    return (
        db.query(Quote)
        .options(joinedload(Quote.containers).joinedload(QuoteContainer.charges))
        .filter(Quote.enquiry_id == enquiry_id, Quote.status == "accepted")
        .order_by(Quote.updated_at.desc(), Quote.id.desc())
        .first()
    )


def _sum_quote_economics_for_enquiry(db: Session, enquiry_id: int) -> Tuple[float, float]:
    """
    Prefer post-SI final quote charges; fall back to accepted source quote.
    Many jobs never get a FinalQuote row, so telex-only sync was dropping main freight.
    """
    final_quote = _load_final_quote_for_enquiry(db, enquiry_id)
    if final_quote and (final_quote.containers or []):
        return _sum_container_charges_economics(final_quote.containers)

    accepted = _load_accepted_quote_for_enquiry(db, enquiry_id)
    if accepted:
        return _sum_container_charges_economics(accepted.containers)

    return 0.0, 0.0


def _sum_final_quote_economics(final_quote: FinalQuote) -> Tuple[float, float]:
    """Shipping-line rate -> cost; client (vendor) rate -> revenue."""
    return _sum_container_charges_economics(final_quote.containers)


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


def has_quote_economics_source(db: Session, enquiry_id: int) -> bool:
    """True when a final quote or accepted source quote exists for the enquiry."""
    if (
        db.query(FinalQuote.id)
        .filter(FinalQuote.enquiry_id == enquiry_id)
        .first()
    ):
        return True
    return (
        db.query(Quote.id)
        .filter(Quote.enquiry_id == enquiry_id, Quote.status == "accepted")
        .first()
        is not None
    )


def quote_economics_source_label(db: Session, enquiry_id: int) -> Optional[str]:
    """Return 'final' | 'initial' | None for which charge book drives economics."""
    final_quote = _load_final_quote_for_enquiry(db, enquiry_id)
    if final_quote and (final_quote.containers or []):
        return "final"
    if _load_accepted_quote_for_enquiry(db, enquiry_id):
        return "initial"
    return None


def eligible_enquiry_ids_for_economics(db: Session) -> list[int]:
    """
    Enquiries that should carry cost / revenue / gross margin:
      - non-void, stage >= 3 (moved to tracking), and
      - final quote exists, or accepted initial quote, or additional invoice.
    """
    from backend.models.enquiry import Enquiry

    tracking_ids = {
        row[0]
        for row in db.query(Enquiry.id)
        .filter(Enquiry.is_void == False, Enquiry.stage >= 3)
        .all()
    }
    if not tracking_ids:
        return []

    quote_ids = {
        row[0]
        for row in db.query(FinalQuote.enquiry_id)
        .filter(FinalQuote.enquiry_id.in_(tracking_ids))
        .distinct()
        .all()
    } | {
        row[0]
        for row in db.query(Quote.enquiry_id)
        .filter(Quote.enquiry_id.in_(tracking_ids), Quote.status == "accepted")
        .distinct()
        .all()
    } | {
        row[0]
        for row in db.query(ShipmentDocument.enquiry_id)
        .filter(
            ShipmentDocument.enquiry_id.in_(tracking_ids),
            ShipmentDocument.document_type == "additionalInvoice",
        )
        .distinct()
        .all()
    }
    return sorted(quote_ids)


def compute_enquiry_economics(db: Session, enquiry_id: int) -> Tuple[float, float]:
    cost = 0.0
    revenue = 0.0

    quote_cost, quote_revenue = _sum_quote_economics_for_enquiry(db, enquiry_id)
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
    Upsert enquiry_economics for an enquiry from final/accepted quote + additional line items.
    Also syncs sob_date from shipment_statuses.
    Skips when there is no quote source and no additional invoices.
    """
    additional = _sum_additional_line_items_inr(db, enquiry_id)
    if not has_quote_economics_source(db, enquiry_id) and additional <= 0:
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
