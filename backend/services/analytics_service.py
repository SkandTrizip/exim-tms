"""Dashboard analytics from enquiry_economics (user-populated cost/revenue per enquiry)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models.enquiry import Enquiry
from backend.models.enquiry_economics import EnquiryEconomics
from backend.models.shipment_status import ShipmentStatus


def _margin_pct(revenue: float, cost: float) -> Optional[float]:
    if revenue <= 0:
        return None
    return round(((revenue - cost) / revenue) * 100, 2)


def get_dashboard_analytics(db: Session) -> Dict[str, Any]:
    rows_q = (
        db.query(EnquiryEconomics, Enquiry, ShipmentStatus)
        .join(Enquiry, Enquiry.id == EnquiryEconomics.enquiry_id)
        .outerjoin(ShipmentStatus, ShipmentStatus.enquiry_id == Enquiry.id)
        .filter(Enquiry.is_void == False)
        .order_by(EnquiryEconomics.updated_at.desc(), EnquiryEconomics.id.desc())
        .all()
    )

    total_cost = 0.0
    total_revenue = 0.0
    valid_enquiries = 0
    rows: List[Dict[str, Any]] = []

    for economics, enquiry, shipment in rows_q:
        cost = round(float(economics.cost_inr or 0), 2)
        revenue = round(float(economics.revenue_inr or 0), 2)
        capture = round(revenue - cost, 2)
        master_number = (shipment.master_number or "").strip() if shipment else ""

        total_cost += cost
        total_revenue += revenue
        if master_number:
            valid_enquiries += 1

        rows.append({
            "enquiry_id": enquiry.id,
            "enquiry_number": enquiry.enquiry_number,
            "client_name": enquiry.client_name,
            "master_number": master_number or None,
            "route": f"{enquiry.origin or '—'} → {enquiry.destination or '—'}",
            "cost_inr": cost,
            "revenue_inr": revenue,
            "capture_inr": capture,
            "margin_pct": _margin_pct(revenue, cost),
        })

    capture_total = round(total_revenue - total_cost, 2)
    adhoc_count = len(rows) - valid_enquiries
    unrealized_revenue = round(
        sum(r["revenue_inr"] for r in rows if not r.get("master_number")),
        2,
    )

    sorted_rows = sorted(rows, key=lambda r: r["enquiry_id"])
    cum_revenue: List[float] = []
    cum_cost: List[float] = []
    cum_margin: List[float] = []
    cum_trips: List[int] = []
    running_rev = running_cost = 0.0
    for i, row in enumerate(sorted_rows, start=1):
        running_rev += row["revenue_inr"]
        running_cost += row["cost_inr"]
        cum_revenue.append(round(running_rev, 2))
        cum_cost.append(round(running_cost, 2))
        cum_margin.append(round(running_rev - running_cost, 2))
        cum_trips.append(i)

    return {
        "summary": {
            "valid_enquiries": valid_enquiries,
            "total_enquiries": len(rows),
            "contracted_count": valid_enquiries,
            "adhoc_count": adhoc_count,
            "total_cost_inr": round(total_cost, 2),
            "total_revenue_inr": round(total_revenue, 2),
            "unrealized_revenue_inr": unrealized_revenue,
            "capture_inr": capture_total,
            "margin_pct": _margin_pct(total_revenue, total_cost),
            "sparklines": {
                "trips": cum_trips,
                "revenue": cum_revenue,
                "cost": cum_cost,
                "margin": cum_margin,
            },
        },
        "enquiries": rows,
    }
