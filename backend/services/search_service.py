from __future__ import annotations

from typing import Iterable

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.models.document import ShipmentDocument
from backend.models.enquiry import Enquiry
from backend.models.invoice import Invoice
from backend.models.quote import Quote
from backend.models.shipment_status import ShipmentStatus
from backend.models.finance import ShippingPayment
from backend.schemas.search import (
    SearchResultItem,
    ShipmentDetailResponse,
    ShipmentDocumentItem,
    ShipmentInvoiceItem,
    ShipmentQuoteSummary,
    ShipmentStatusDetail,
    ShippingPaymentItem,
)


SEARCH_SCOPES = frozenset({"all", "enquiry", "client", "shipping_line", "mbl", "invoice", "document"})


def _normalize_scopes(scopes: Iterable[str] | None) -> set[str]:
    if not scopes:
        return {"all"}
    normalized = {s.strip().lower() for s in scopes if s and s.strip()}
    return normalized or {"all"}


def _accepted_quote(quotes: list[Quote]) -> Quote | None:
    if not quotes:
        return None
    for quote in quotes:
        if (quote.status or "").lower() == "accepted":
            return quote
    return quotes[0]


def _quote_summary(quote: Quote | None) -> ShipmentQuoteSummary | None:
    if not quote:
        return None
    return ShipmentQuoteSummary(
        id=quote.id,
        quote_name=quote.quote_name,
        quote_number=quote.quote_number,
        shipping_line=quote.shipping_line,
        status=quote.status,
        final_quote_inr=quote.final_quote_inr,
        port_of_loading=quote.port_of_loading,
        port_of_discharge=quote.port_of_discharge,
        rate_validity_date=quote.rate_validity_date,
    )


def _enquiry_to_dict(enquiry: Enquiry) -> dict:
    return {
        "id": enquiry.id,
        "enquiry_number": enquiry.enquiry_number,
        "client_name": enquiry.client_name,
        "shipment_type": enquiry.shipment_type,
        "client_scope": enquiry.client_scope,
        "enquiry_received_date": enquiry.enquiry_received_date,
        "stuffing_date": enquiry.stuffing_date,
        "origin": enquiry.origin,
        "destination": enquiry.destination,
        "origin_port_code": enquiry.origin_port_code,
        "destination_port_code": enquiry.destination_port_code,
        "preferred_origin_port": enquiry.preferred_origin_port,
        "preferred_destination_port": enquiry.preferred_destination_port,
        "incoterm": enquiry.incoterm,
        "mode_of_transport_origin": enquiry.mode_of_transport_origin,
        "mode_of_transport_destination": enquiry.mode_of_transport_destination,
        "container_type": enquiry.container_type,
        "container_count": enquiry.container_count,
        "commodity": enquiry.commodity,
        "hs_code": enquiry.hs_code,
        "cargo_value": enquiry.cargo_value,
        "cargo_value_currency": enquiry.cargo_value_currency,
        "client_target_rate": enquiry.client_target_rate,
        "remarks": enquiry.remarks,
        "hbl_required": enquiry.hbl_required,
        "delivery_agent": enquiry.delivery_agent,
        "vessel": enquiry.vessel,
        "voyage_no": enquiry.voyage_no,
        "status": enquiry.status,
        "stage": enquiry.stage,
        "is_void": enquiry.is_void,
        "created_at": enquiry.created_at,
    }


def global_search(
    db: Session,
    query: str,
    scopes: Iterable[str] | None = None,
    limit: int = 25,
    skip: int = 0,
) -> tuple[list[SearchResultItem], int]:
    q = (query or "").strip()
    if len(q) < 3:
        return [], 0

    term = f"%{q}%"
    scope_set = _normalize_scopes(scopes)
    use_all = "all" in scope_set

    enquiry_ids: set[int] = set()
    match_map: dict[int, set[str]] = {}

    def add_matches(rows: list[tuple[int, str]]) -> None:
        for enquiry_id, label in rows:
            if enquiry_id is None:
                continue
            enquiry_ids.add(enquiry_id)
            match_map.setdefault(enquiry_id, set()).add(label)

    if use_all or "enquiry" in scope_set:
        rows = (
            db.query(Enquiry.id)
            .filter(
                Enquiry.is_void.is_(False),
                or_(
                    Enquiry.enquiry_number.ilike(term),
                    Enquiry.origin.ilike(term),
                    Enquiry.destination.ilike(term),
                    Enquiry.commodity.ilike(term),
                    Enquiry.container_type.ilike(term),
                    Enquiry.hs_code.ilike(term),
                ),
            )
            .all()
        )
        add_matches([(row[0], "Enquiry") for row in rows])

    if use_all or "client" in scope_set:
        rows = (
            db.query(Enquiry.id)
            .filter(Enquiry.is_void.is_(False), Enquiry.client_name.ilike(term))
            .all()
        )
        add_matches([(row[0], "Client") for row in rows])

    if use_all or "shipping_line" in scope_set:
        rows = (
            db.query(Quote.enquiry_id)
            .join(Enquiry, Enquiry.id == Quote.enquiry_id)
            .filter(Enquiry.is_void.is_(False), Quote.shipping_line.ilike(term))
            .distinct()
            .all()
        )
        add_matches([(row[0], "Shipping line") for row in rows if row[0]])

    if use_all or "mbl" in scope_set:
        rows = (
            db.query(ShipmentStatus.enquiry_id)
            .join(Enquiry, Enquiry.id == ShipmentStatus.enquiry_id)
            .filter(
                Enquiry.is_void.is_(False),
                or_(
                    ShipmentStatus.master_number.ilike(term),
                    ShipmentStatus.si_number.ilike(term),
                    ShipmentStatus.container_number.ilike(term),
                    ShipmentStatus.port_of_origin.ilike(term),
                    ShipmentStatus.final_destination.ilike(term),
                    ShipmentStatus.vessel.ilike(term),
                    ShipmentStatus.voyage.ilike(term),
                ),
            )
            .all()
        )
        add_matches([(row[0], "mBL / tracking") for row in rows if row[0]])

    if use_all or "invoice" in scope_set:
        rows = (
            db.query(Invoice.enquiry_id)
            .join(Enquiry, Enquiry.id == Invoice.enquiry_id)
            .filter(
                Enquiry.is_void.is_(False),
                or_(
                    Invoice.invoice_number.ilike(term),
                    Invoice.customer_invoice_no.ilike(term),
                    Invoice.payment_reference.ilike(term),
                    Invoice.irn.ilike(term),
                ),
            )
            .all()
        )
        add_matches([(row[0], "Invoice") for row in rows if row[0]])

    if use_all or "document" in scope_set:
        rows = (
            db.query(ShipmentDocument.enquiry_id)
            .join(Enquiry, Enquiry.id == ShipmentDocument.enquiry_id)
            .filter(Enquiry.is_void.is_(False), ShipmentDocument.file_name.ilike(term))
            .all()
        )
        add_matches([(row[0], "Document") for row in rows if row[0]])

    if not enquiry_ids:
        return [], 0

    ordered_ids = (
        db.query(Enquiry.id)
        .filter(Enquiry.id.in_(enquiry_ids))
        .order_by(Enquiry.id.desc())
        .all()
    )
    ordered_ids = [row[0] for row in ordered_ids]
    total = len(ordered_ids)
    page_ids = ordered_ids[skip : skip + limit]

    enquiries = db.query(Enquiry).filter(Enquiry.id.in_(page_ids)).all()
    enquiry_by_id = {enquiry.id: enquiry for enquiry in enquiries}

    statuses = (
        db.query(ShipmentStatus)
        .filter(ShipmentStatus.enquiry_id.in_(page_ids))
        .all()
    )
    status_by_id = {status.enquiry_id: status for status in statuses}

    quotes = db.query(Quote).filter(Quote.enquiry_id.in_(page_ids)).order_by(Quote.id.desc()).all()
    quotes_by_enquiry: dict[int, list[Quote]] = {}
    for quote in quotes:
        quotes_by_enquiry.setdefault(quote.enquiry_id, []).append(quote)

    invoices = db.query(Invoice).filter(Invoice.enquiry_id.in_(page_ids)).order_by(Invoice.id.desc()).all()
    invoice_by_enquiry: dict[int, Invoice] = {}
    for invoice in invoices:
        invoice_by_enquiry.setdefault(invoice.enquiry_id, invoice)

    results: list[SearchResultItem] = []
    for enquiry_id in page_ids:
        enquiry = enquiry_by_id.get(enquiry_id)
        if not enquiry:
            continue
        status = status_by_id.get(enquiry_id)
        accepted = _accepted_quote(quotes_by_enquiry.get(enquiry_id, []))
        latest_invoice = invoice_by_enquiry.get(enquiry_id)
        results.append(
            SearchResultItem(
                enquiry_id=enquiry.id,
                enquiry_number=enquiry.enquiry_number,
                client_name=enquiry.client_name,
                origin=enquiry.origin,
                destination=enquiry.destination,
                shipping_line=accepted.shipping_line if accepted else None,
                master_number=status.master_number if status else None,
                si_number=status.si_number if status else None,
                container_number=status.container_number if status else None,
                invoice_number=latest_invoice.invoice_number if latest_invoice else None,
                stage=enquiry.stage or 1,
                status=enquiry.status or "pending",
                is_void=bool(enquiry.is_void),
                match_labels=sorted(match_map.get(enquiry_id, set())),
            )
        )

    return results, total


def get_shipment_detail(db: Session, enquiry_id: int) -> ShipmentDetailResponse | None:
    enquiry = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enquiry:
        return None

    status = db.query(ShipmentStatus).filter(ShipmentStatus.enquiry_id == enquiry_id).first()
    quotes = db.query(Quote).filter(Quote.enquiry_id == enquiry_id).order_by(Quote.id.desc()).all()
    documents = (
        db.query(ShipmentDocument)
        .filter(ShipmentDocument.enquiry_id == enquiry_id)
        .order_by(ShipmentDocument.id.desc())
        .all()
    )
    invoices = (
        db.query(Invoice)
        .filter(Invoice.enquiry_id == enquiry_id)
        .order_by(Invoice.id.desc())
        .all()
    )
    shipping_payments = (
        db.query(ShippingPayment)
        .filter(ShippingPayment.enquiry_id == enquiry_id)
        .order_by(ShippingPayment.created_at.desc().nullslast(), ShippingPayment.id.desc())
        .all()
    )

    accepted = _accepted_quote(quotes)
    return ShipmentDetailResponse(
        enquiry=_enquiry_to_dict(enquiry),
        status=ShipmentStatusDetail.model_validate(status) if status else None,
        quotes=[ShipmentQuoteSummary.model_validate(quote) for quote in quotes],
        accepted_quote=_quote_summary(accepted),
        documents=[ShipmentDocumentItem.model_validate(doc) for doc in documents],
        invoices=[ShipmentInvoiceItem.model_validate(inv) for inv in invoices],
        shipping_payments=[ShippingPaymentItem.model_validate(p) for p in shipping_payments],
    )
