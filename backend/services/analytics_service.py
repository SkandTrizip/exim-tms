"""Dashboard analytics from enquiry_economics (synced from final/initial quote + additional invoices)."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.models.enquiry import Enquiry
from backend.models.enquiry_economics import EnquiryEconomics
from backend.models.final_quote import FinalQuote, FinalQuoteContainer
from backend.models.quote import Quote
from backend.models.shipment_status import ShipmentStatus

_MONTH_NAMES = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

# Indian FY month order: Apr → Mar
_FY_MONTH_ORDER = (4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3)


def _margin_pct(revenue: float, cost: float) -> Optional[float]:
    if revenue <= 0:
        return None
    return round(((revenue - cost) / revenue) * 100, 2)


def _month_key(d) -> Optional[str]:
    if not d:
        return None
    return f"{d.year:04d}-{d.month:02d}"


def _month_label(key: str, *, short: bool = False) -> str:
    try:
        year, month = key.split("-")
        name = _MONTH_NAMES[int(month) - 1]
        return name if short else f"{name} {year}"
    except (ValueError, IndexError):
        return key


def current_financial_year_start(today: Optional[date] = None) -> int:
    """Return the start calendar year of the Indian FY (April–March)."""
    today = today or date.today()
    return today.year if today.month >= 4 else today.year - 1


def parse_financial_year(fy: Optional[str], today: Optional[date] = None) -> int:
    """
    Parse '2026-27' / '2026-2027' / '2026' into FY start year.
    Defaults to the current Indian financial year.
    """
    if not fy or not str(fy).strip():
        return current_financial_year_start(today)

    text = str(fy).strip()
    try:
        if "-" in text:
            start = int(text.split("-")[0])
            return start
        return int(text)
    except ValueError:
        return current_financial_year_start(today)


def financial_year_bounds(fy_start: int) -> Tuple[date, date]:
    """Inclusive start/end dates for FY starting in April `fy_start`."""
    return date(fy_start, 4, 1), date(fy_start + 1, 3, 31)


def financial_year_label(fy_start: int) -> str:
    return f"{fy_start}-{str(fy_start + 1)[-2:]}"


def financial_year_month_keys(fy_start: int) -> List[str]:
    """YYYY-MM keys for Apr→Mar of the given FY."""
    keys: List[str] = []
    for month in _FY_MONTH_ORDER:
        year = fy_start if month >= 4 else fy_start + 1
        keys.append(f"{year:04d}-{month:02d}")
    return keys


def _fy_start_for_date(d: date) -> int:
    return d.year if d.month >= 4 else d.year - 1


def _month_in_fy_range(
    month_key: Optional[str],
    month_from: Optional[str],
    month_to: Optional[str],
    fy_months: List[str],
) -> bool:
    """True when month_key falls within [month_from, month_to] in FY order."""
    if not month_key or month_key not in fy_months:
        return False
    if not month_from and not month_to:
        return True
    idx = fy_months.index(month_key)
    start_idx = fy_months.index(month_from) if month_from in fy_months else 0
    end_idx = (
        fy_months.index(month_to) if month_to in fy_months else len(fy_months) - 1
    )
    if start_idx > end_idx:
        start_idx, end_idx = end_idx, start_idx
    return start_idx <= idx <= end_idx


def _aggregate_totals(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    cost = round(sum(r["cost_inr"] for r in rows), 2)
    revenue = round(sum(r["revenue_inr"] for r in rows), 2)
    gross_margin = round(revenue - cost, 2)

    final_rows = [r for r in rows if r.get("economics_status") == "final"]
    net_cost = round(sum(r["cost_inr"] for r in final_rows), 2)
    net_revenue = round(sum(r["revenue_inr"] for r in final_rows), 2)
    net_margin = round(net_revenue - net_cost, 2)

    return {
        "cost_inr": cost,
        "revenue_inr": revenue,
        "capture_inr": gross_margin,
        "gross_margin_inr": gross_margin,
        "gross_margin_pct": _margin_pct(revenue, cost),
        "net_cost_inr": net_cost,
        "net_revenue_inr": net_revenue,
        "net_margin_inr": net_margin,
        "net_margin_pct": _margin_pct(net_revenue, net_cost),
        "margin_pct": _margin_pct(revenue, cost),
        "trips": len(rows),
        "final_trips": len(final_rows),
    }


def get_dashboard_analytics(
    db: Session,
    *,
    month: Optional[str] = None,
    month_from: Optional[str] = None,
    month_to: Optional[str] = None,
    metric: str = "gross_margin",
    fy: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build analytics summary, per-enquiry rows, and FY month-wise series.

    Inclusion (cost / revenue / gross margin):
      - Final (settled) enquiries with SOB / net economics
      - Ongoing tracking enquiries (stage >= 3) with an initial (accepted) quote

    Margin definitions:
      - gross_margin_inr: revenue − cost on all included rows (final + ongoing)
      - net_margin_inr: revenue − cost on final (SOB-settled) rows only

    Filters:
      - fy: '2026-27' Indian financial year (Apr–Mar)
      - month: 'YYYY-MM' — single SOB month (legacy; overrides month_from/month_to)
      - month_from / month_to: inclusive SOB month range within FY
      - metric: 'cost' | 'revenue' | 'gross_margin' | 'net_margin' | 'both'
    """
    metric_key = (metric or "gross_margin").lower()
    if metric_key == "both":
        metric_key = "gross_margin"
    if metric_key not in ("cost", "revenue", "gross_margin", "net_margin"):
        metric_key = "gross_margin"

    range_from = month_from or None
    range_to = month_to or None
    if month:
        range_from = month
        range_to = month

    fy_start = parse_financial_year(fy)
    fy_start_date, fy_end_date = financial_year_bounds(fy_start)
    fy_months = financial_year_month_keys(fy_start)

    rows_q = (
        db.query(EnquiryEconomics, Enquiry, ShipmentStatus)
        .join(Enquiry, Enquiry.id == EnquiryEconomics.enquiry_id)
        .outerjoin(ShipmentStatus, ShipmentStatus.enquiry_id == Enquiry.id)
        .filter(Enquiry.is_void == False, Enquiry.stage >= 3)
        .order_by(EnquiryEconomics.updated_at.desc(), EnquiryEconomics.id.desc())
        .all()
    )

    final_quote_enquiry_ids = {
        row[0]
        for row in (
            db.query(FinalQuote.enquiry_id)
            .join(FinalQuoteContainer, FinalQuoteContainer.final_quote_id == FinalQuote.id)
            .distinct()
            .all()
        )
    }
    accepted_quote_enquiry_ids = {
        row[0]
        for row in db.query(Quote.enquiry_id).filter(Quote.status == "accepted").distinct().all()
    }

    all_rows: List[Dict[str, Any]] = []
    fy_years_seen = {fy_start}

    for economics, enquiry, shipment in rows_q:
        cost = round(float(economics.cost_inr or 0), 2)
        revenue = round(float(economics.revenue_inr or 0), 2)
        # Skip empty shells (no quote economics yet)
        if cost <= 0 and revenue <= 0:
            continue

        gross_margin = round(revenue - cost, 2)
        master_number = (shipment.master_number or "").strip() if shipment else ""

        sob_date = economics.sob_date
        if sob_date is None and shipment and shipment.sob:
            sob = shipment.sob
            sob_date = sob.date() if hasattr(sob, "date") else sob

        sob_month = _month_key(sob_date)
        if sob_date:
            fy_years_seen.add(_fy_start_for_date(sob_date))

        if enquiry.id in final_quote_enquiry_ids:
            quote_source = "final"
        elif enquiry.id in accepted_quote_enquiry_ids:
            quote_source = "initial"
        else:
            quote_source = "additional"
        economics_status = "final" if sob_date else "ongoing"

        net_margin = gross_margin if economics_status == "final" else None

        all_rows.append({
            "enquiry_id": enquiry.id,
            "enquiry_number": enquiry.enquiry_number,
            "client_name": enquiry.client_name,
            "master_number": master_number or None,
            "route": f"{enquiry.origin or '—'} → {enquiry.destination or '—'}",
            "cost_inr": cost,
            "revenue_inr": revenue,
            "capture_inr": gross_margin,
            "gross_margin_inr": gross_margin,
            "gross_margin_pct": _margin_pct(revenue, cost),
            "net_margin_inr": net_margin,
            "net_margin_pct": _margin_pct(revenue, cost) if economics_status == "final" else None,
            "margin_pct": _margin_pct(revenue, cost),
            "sob_date": sob_date.isoformat() if sob_date else None,
            "sob_month": sob_month,
            "quote_source": quote_source,
            "has_final_quote": enquiry.id in final_quote_enquiry_ids,
            "economics_status": economics_status,
            "stage": enquiry.stage,
        })

    # SOB-attributed rows in selected FY
    fy_rows = [
        r for r in all_rows
        if r["sob_date"]
        and fy_start_date <= date.fromisoformat(r["sob_date"]) <= fy_end_date
    ]
    # Ongoing tracking (initial quote, no SOB yet) — included in FY totals when no month filter
    ongoing_rows = [r for r in all_rows if not r.get("sob_date")]

    buckets: Dict[str, Dict[str, float]] = {
        key: {
            "cost_inr": 0.0,
            "revenue_inr": 0.0,
            "capture_inr": 0.0,
            "gross_margin_inr": 0.0,
            "net_margin_inr": 0.0,
            "trips": 0,
        }
        for key in fy_months
    }

    for row in fy_rows:
        key = row["sob_month"]
        if key not in buckets:
            continue
        b = buckets[key]
        b["cost_inr"] += row["cost_inr"]
        b["revenue_inr"] += row["revenue_inr"]
        b["capture_inr"] += row["capture_inr"]
        b["gross_margin_inr"] += row["gross_margin_inr"]
        b["net_margin_inr"] += row["gross_margin_inr"]
        b["trips"] += 1

    pending_no_sob = _aggregate_totals(ongoing_rows)
    has_month_filter = bool(range_from or range_to)

    monthly_series: List[Dict[str, Any]] = []
    for key in fy_months:
        b = buckets[key]
        cost = round(b["cost_inr"], 2)
        revenue = round(b["revenue_inr"], 2)
        capture = round(b["capture_inr"], 2)
        gross_m = round(b["gross_margin_inr"], 2)
        net_m = round(b["net_margin_inr"], 2)
        monthly_series.append({
            "month": key,
            "label": _month_label(key),
            "short_label": _month_label(key, short=True),
            "trips": int(b["trips"]),
            "cost_inr": cost,
            "revenue_inr": revenue,
            "capture_inr": capture,
            "gross_margin_inr": gross_m,
            "net_margin_inr": net_m,
            "margin_pct": _margin_pct(revenue, cost),
            "gross_margin_pct": _margin_pct(revenue, cost),
            "net_margin_pct": _margin_pct(revenue, cost),
        })

    # KPIs / table: SOB rows in FY (+ ongoing when no month filter)
    if has_month_filter:
        filtered = [
            r
            for r in fy_rows
            if _month_in_fy_range(r.get("sob_month"), range_from, range_to, fy_months)
        ]
    else:
        filtered = fy_rows + ongoing_rows

    totals = _aggregate_totals(filtered)
    valid_enquiries = sum(1 for r in filtered if r.get("master_number"))
    adhoc_count = len(filtered) - valid_enquiries
    unrealized_revenue = round(
        sum(r["revenue_inr"] for r in filtered if not r.get("master_number")),
        2,
    )
    final_count = sum(1 for r in filtered if r.get("economics_status") == "final")
    ongoing_count = sum(1 for r in filtered if r.get("economics_status") == "ongoing")

    sorted_rows = sorted(filtered, key=lambda r: r["enquiry_id"])
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

    available_months = [
        {"value": m["month"], "label": m["label"], "short_label": m["short_label"]}
        for m in monthly_series
    ]

    available_financial_years = [
        {
            "value": financial_year_label(y),
            "label": f"FY {financial_year_label(y)}",
            "start_year": y,
        }
        for y in sorted(fy_years_seen, reverse=True)
    ]
    selected_label = financial_year_label(fy_start)
    if not any(y["value"] == selected_label for y in available_financial_years):
        available_financial_years.insert(
            0,
            {
                "value": selected_label,
                "label": f"FY {selected_label}",
                "start_year": fy_start,
            },
        )

    return {
        "summary": {
            "valid_enquiries": valid_enquiries,
            "total_enquiries": len(filtered),
            "final_count": final_count,
            "ongoing_count": ongoing_count,
            "contracted_count": valid_enquiries,
            "adhoc_count": adhoc_count,
            "total_cost_inr": totals["cost_inr"],
            "total_revenue_inr": totals["revenue_inr"],
            "unrealized_revenue_inr": unrealized_revenue,
            "capture_inr": totals["gross_margin_inr"],
            "gross_margin_inr": totals["gross_margin_inr"],
            "gross_margin_pct": totals["gross_margin_pct"],
            "net_margin_inr": totals["net_margin_inr"],
            "net_margin_pct": totals["net_margin_pct"],
            "net_cost_inr": totals["net_cost_inr"],
            "net_revenue_inr": totals["net_revenue_inr"],
            "margin_pct": totals["gross_margin_pct"],
            "filter_month": month,
            "filter_month_from": range_from,
            "filter_month_to": range_to,
            "filter_metric": metric_key,
            "filter_fy": selected_label,
            "fy_label": f"FY {selected_label}",
            "fy_range": f"Apr {fy_start} – Mar {fy_start + 1}",
            "pending_no_sob": pending_no_sob,
            "pipeline_margin_inr": (
                pending_no_sob["gross_margin_inr"]
                if not has_month_filter and pending_no_sob["trips"] > 0
                else 0.0
            ),
            "sparklines": {
                "trips": cum_trips,
                "revenue": cum_revenue,
                "cost": cum_cost,
                "margin": cum_margin,
            },
        },
        "monthly_series": monthly_series,
        "available_months": available_months,
        "available_financial_years": available_financial_years,
        "enquiries": filtered,
    }
