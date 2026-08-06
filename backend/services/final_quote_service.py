from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
import datetime
from typing import Optional

from backend.models.quote import Quote, QuoteContainer, QuoteCharge
from backend.models.final_quote import FinalQuote, FinalQuoteContainer, FinalQuoteCharge
from backend.models.shipment_status import ShipmentStatus
from backend.schemas.final_quote import FinalQuoteUpdate
from backend.constants.quote_remarks import validate_quote_remarks
from backend.services.enquiry_economics_service import sync_enquiry_economics
from backend.utils.logger import logger


def _load_source_quote(db: Session, quote_id: int) -> Optional[Quote]:
    return (
        db.query(Quote)
        .options(joinedload(Quote.containers).joinedload(QuoteContainer.charges))
        .filter(Quote.id == quote_id)
        .first()
    )


def _load_final_quote(db: Session, final_quote_id: int) -> Optional[FinalQuote]:
    return (
        db.query(FinalQuote)
        .options(joinedload(FinalQuote.containers).joinedload(FinalQuoteContainer.charges))
        .filter(FinalQuote.id == final_quote_id)
        .first()
    )


def get_final_by_source_quote_id(db: Session, source_quote_id: int) -> Optional[FinalQuote]:
    return (
        db.query(FinalQuote)
        .options(joinedload(FinalQuote.containers).joinedload(FinalQuoteContainer.charges))
        .filter(FinalQuote.source_quote_id == source_quote_id)
        .first()
    )


def _charge_inr(quantity: float, rate: float, currency: str, exchange_rate: float) -> float:
    total = quantity * rate
    if (currency or "INR").upper() == "USD":
        return total * exchange_rate
    return total


def _copy_source_to_final(db: Session, source: Quote) -> FinalQuote:
    """Create final quote rows as a copy of the accepted source quote."""
    existing = get_final_by_source_quote_id(db, source.id)
    if existing:
        return existing

    final = FinalQuote(
        enquiry_id=source.enquiry_id,
        source_quote_id=source.id,
        quote_name=source.quote_name,
        place_of_receipt=source.place_of_receipt,
        port_of_loading=source.port_of_loading,
        port_of_discharge=source.port_of_discharge,
        final_place_of_delivery=source.final_place_of_delivery,
        shipping_line=source.shipping_line,
        incoterm=source.incoterm,
        rate_currency=source.rate_currency,
        transit_time_days=source.transit_time_days,
        rate_validity_date=source.rate_validity_date,
        destination_free_days=source.destination_free_days,
        total_origin_charges_inr=source.total_origin_charges_inr,
        total_destination_charges_usd=source.total_destination_charges_usd,
        final_quote_inr=source.final_quote_inr,
    )
    db.add(final)
    db.flush()

    for container_seq, src_container in enumerate(
        sorted(source.containers, key=lambda c: (c.container_sequence or 0, c.id or 0))
    ):
        db_container = FinalQuoteContainer(
            final_quote_id=final.id,
            enquiry_id=source.enquiry_id,
            container_type=src_container.container_type,
            container_sequence=container_seq,
        )
        db.add(db_container)
        db.flush()

        for seq, src_charge in enumerate(
            sorted(src_container.charges, key=lambda ch: (ch.charge_sequence or 0, ch.id or 0))
        ):
            calculated_total = (src_charge.quantity or 0) * (src_charge.rate or 0)
            calculated_inr = _charge_inr(
                src_charge.quantity or 0,
                src_charge.rate or 0,
                src_charge.currency or "INR",
                src_charge.exchange_rate or 1,
            )
            line_ex = src_charge.exchange_rate or 1
            curr = (src_charge.currency or "INR").upper()
            vendor_ex = src_charge.vendor_exchange_rate
            if vendor_ex is None or (
                curr != "INR"
                and float(vendor_ex or 0) == 1.0
                and float(line_ex or 1) != 1.0
            ):
                vendor_ex = line_ex
            db_charge = FinalQuoteCharge(
                container_id=db_container.id,
                final_quote_id=final.id,
                enquiry_id=source.enquiry_id,
                charge_description=src_charge.charge_description,
                account_type=src_charge.account_type,
                currency=src_charge.currency,
                charged_on=src_charge.charged_on,
                quantity=src_charge.quantity,
                rate=src_charge.rate,
                total_amount=calculated_total,
                exchange_rate=src_charge.exchange_rate,
                final_inr_amount=calculated_inr,
                vendor_rate=src_charge.vendor_rate,
                vendor_exchange_rate=vendor_ex,
                charge_sequence=seq,
            )
            db.add(db_charge)

    db.commit()
    db.refresh(final)
    logger.info(f"Created final quote from source quote ID {source.id}")
    sync_enquiry_economics(db, source.enquiry_id, commit=True)
    return _load_final_quote(db, final.id)


def get_or_create_final_for_source(db: Session, source_quote_id: int) -> FinalQuote:
    source = _load_source_quote(db, source_quote_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source quote not found")
    if source.status != "accepted":
        raise HTTPException(status_code=400, detail="Final quote is only available for accepted quotes")

    final = get_final_by_source_quote_id(db, source_quote_id)
    if final:
        return final
    return _copy_source_to_final(db, source)


def update_final_revision(db: Session, source_quote_id: int, data: FinalQuoteUpdate) -> FinalQuote:
    """
    Update final quote containers/charges after SI submitted.
    Never modifies the source quote (initial confirmed rates).
    """
    source = _load_source_quote(db, source_quote_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source quote not found")
    if source.status != "accepted":
        raise HTTPException(status_code=400, detail="Final revision is only allowed for accepted quotes")

    shipment = (
        db.query(ShipmentStatus)
        .filter(ShipmentStatus.enquiry_id == source.enquiry_id)
        .first()
    )
    if not shipment or not shipment.si_submitted:
        raise HTTPException(
            status_code=403,
            detail="SI must be submitted before updating the final quote",
        )

    if data.containers is None:
        raise HTTPException(status_code=400, detail="containers are required for final revision")

    try:
        remarks_reason, remarks_other = validate_quote_remarks(data.remarks_reason, data.remarks_other)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    final = get_or_create_final_for_source(db, source_quote_id)

    db.query(FinalQuoteCharge).filter(FinalQuoteCharge.final_quote_id == final.id).delete()
    db.query(FinalQuoteContainer).filter(FinalQuoteContainer.final_quote_id == final.id).delete()

    quote_total_origin_inr = 0.0
    quote_final_inr = 0.0

    for container_seq, container_data in enumerate(data.containers):
        db_container = FinalQuoteContainer(
            final_quote_id=final.id,
            enquiry_id=source.enquiry_id,
            container_type=container_data.container_type,
            container_sequence=container_seq,
        )
        db.add(db_container)
        db.flush()

        for seq, charge_data in enumerate(container_data.charges):
            calculated_total = charge_data.quantity * charge_data.rate
            calculated_inr = _charge_inr(
                charge_data.quantity,
                charge_data.rate,
                charge_data.currency,
                charge_data.exchange_rate,
            )

            db_charge = FinalQuoteCharge(
                container_id=db_container.id,
                final_quote_id=final.id,
                enquiry_id=source.enquiry_id,
                charge_description=charge_data.charge_description,
                account_type=charge_data.account_type,
                currency=charge_data.currency,
                charged_on=charge_data.charged_on,
                quantity=charge_data.quantity,
                rate=charge_data.rate,
                total_amount=calculated_total,
                exchange_rate=charge_data.exchange_rate,
                final_inr_amount=calculated_inr,
                vendor_rate=charge_data.vendor_rate,
                vendor_exchange_rate=charge_data.vendor_exchange_rate,
                charge_sequence=seq,
            )
            db.add(db_charge)

            if charge_data.account_type == "On Your Account":
                quote_total_origin_inr += calculated_inr
                quote_final_inr += calculated_inr

    final.total_origin_charges_inr = (
        data.total_origin_charges_inr
        if data.total_origin_charges_inr is not None
        else quote_total_origin_inr
    )
    final.final_quote_inr = (
        data.final_quote_inr if data.final_quote_inr is not None else quote_final_inr
    )
    final.revision_remarks_reason = remarks_reason
    final.revision_remarks_other = remarks_other
    final.updated_at = datetime.datetime.utcnow()

    db.commit()
    refreshed = _load_final_quote(db, final.id)
    logger.info(f"Final quote revision saved for source quote ID {source_quote_id}")
    sync_enquiry_economics(db, source.enquiry_id, commit=True)
    return refreshed
