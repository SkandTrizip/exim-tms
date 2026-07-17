"""Dashboard analytics from enquiry_economics (synced from final quote + additional invoices)."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.models.enquiry import Enquiry
from backend.models.enquiry_economics import EnquiryEconomics
from backend.models.final_quote import FinalQuote
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


def teu_factor_for_container_type(container_type: Optional[str]) -> float:
    """
    TEU multiplier per physical container.
    20' → 1 TEU; 40'/45' (incl. HC) → 2 TEU.
    """
    if not container_type:
        return 1.0
    text = str(container_type).strip().upper().replace(" ", "")
    if text.startswith("45") or text.startswith("40") or "'45" in text or "'40" in text:
        return 2.0
    if text.startswith("20") or "'20" in text:
        return 1.0
    if "40" in text or "45" in text:
        return 2.0
    return 1.0


def teu_for_enquiry(container_type: Optional[str], container_count) -> float:
    try:
        count = float(container_count or 0)
    except (TypeError, ValueError):
        count = 0.0
    if count <= 0:
        return 0.0
    return round(count * teu_factor_for_container_type(container_type), 2)


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


def get_dashboard_analytics(
    db: Session,
    *,
    month: Optional[str] = None,
    month_from: Optional[str] = None,
    month_to: Optional[str] = None,
    metric: str = "both",
    fy: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build analytics summary, per-enquiry rows, and FY month-wise series by SOB date.

    Net metrics (capture_inr / margin_pct) use SOB-settled rows only.
    Gross margin = net margin + ongoing trips, where ongoing means:
      accepted initial quote, no SOB yet, and no final quote.

    Filters:
      - fy: '2026-27' Indian financial year (Apr–Mar)
      - month: 'YYYY-MM' — single SOB month (legacy; overrides month_from/month_to)
      - month_from / month_to: inclusive SOB month range within FY
      - metric: 'cost' | 'revenue' | 'both' | 'net_margin' | 'gross_margin'
    """
    metric_key = (metric or "both").lower()
    if metric_key == "both":
        metric_key = "net_margin"
    if metric_key not in ("cost", "revenue", "net_margin", "gross_margin"):
        metric_key = "net_margin"

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
        .filter(Enquiry.is_void == False)
        .order_by(EnquiryEconomics.updated_at.desc(), EnquiryEconomics.id.desc())
        .all()
    )

    all_rows: List[Dict[str, Any]] = []
    fy_years_seen = {fy_start}

    for economics, enquiry, shipment in rows_q:
        cost = round(float(economics.cost_inr or 0), 2)
        revenue = round(float(economics.revenue_inr or 0), 2)
        capture = round(revenue - cost, 2)
        master_number = (shipment.master_number or "").strip() if shipment else ""

        sob_date = economics.sob_date
        if sob_date is None and shipment and shipment.sob:
            sob = shipment.sob
            sob_date = sob.date() if hasattr(sob, "date") else sob

        sob_month = _month_key(sob_date)
        if sob_date:
            fy_years_seen.add(_fy_start_for_date(sob_date))

        all_rows.append({
            "enquiry_id": enquiry.id,
            "enquiry_number": enquiry.enquiry_number,
            "client_name": enquiry.client_name,
            "master_number": master_number or None,
            "origin": enquiry.origin or None,
            "destination": enquiry.destination or None,
            "container_type": enquiry.container_type or None,
            "container_count": int(enquiry.container_count or 0),
            "teu": teu_for_enquiry(enquiry.container_type, enquiry.container_count),
            "route": f"{enquiry.origin or '—'} → {enquiry.destination or '—'}",
            "cost_inr": cost,
            "revenue_inr": revenue,
            "capture_inr": capture,
            "margin_pct": _margin_pct(revenue, cost),
            "sob_date": sob_date.isoformat() if sob_date else None,
            "sob_month": sob_month,
            "economics_status": "final" if sob_date else "pending",
        })

    # Restrict working set to selected FY (SOB in Apr–Mar); keep no-SOB for pending/ongoing
    fy_rows = [
        r for r in all_rows
        if r["sob_date"]
        and fy_start_date <= date.fromisoformat(r["sob_date"]) <= fy_end_date
    ]
    pending_rows = [r for r in all_rows if not r.get("sob_date")]

    # Ongoing: accepted initial quote, no SOB, no final quote yet
    pending_enquiry_ids = [r["enquiry_id"] for r in pending_rows]
    accepted_ids = set()
    final_ids = set()
    if pending_enquiry_ids:
        accepted_ids = {
            row[0]
            for row in db.query(Quote.enquiry_id)
            .filter(
                Quote.enquiry_id.in_(pending_enquiry_ids),
                Quote.status == "accepted",
            )
            .distinct()
            .all()
        }
        final_ids = {
            row[0]
            for row in db.query(FinalQuote.enquiry_id)
            .filter(FinalQuote.enquiry_id.in_(pending_enquiry_ids))
            .distinct()
            .all()
        }

    ongoing_rows = []
    for r in pending_rows:
        if r["enquiry_id"] in accepted_ids and r["enquiry_id"] not in final_ids:
            row = dict(r)
            row["economics_status"] = "ongoing"
            ongoing_rows.append(row)

    buckets: Dict[str, Dict[str, float]] = {
        key: {
            "cost_inr": 0.0,
            "revenue_inr": 0.0,
            "capture_inr": 0.0,
            "trips": 0,
            "teu": 0.0,
            "containers": 0,
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
        b["trips"] += 1
        b["teu"] += float(row.get("teu") or 0)
        b["containers"] += int(row.get("container_count") or 0)

    pending_no_sob = {
        "cost_inr": round(sum(r["cost_inr"] for r in pending_rows), 2),
        "revenue_inr": round(sum(r["revenue_inr"] for r in pending_rows), 2),
        "capture_inr": round(sum(r["capture_inr"] for r in pending_rows), 2),
        "trips": len(pending_rows),
    }
    pending_no_sob["margin_pct"] = _margin_pct(
        pending_no_sob["revenue_inr"], pending_no_sob["cost_inr"]
    )

    ongoing = {
        "cost_inr": round(sum(r["cost_inr"] for r in ongoing_rows), 2),
        "revenue_inr": round(sum(r["revenue_inr"] for r in ongoing_rows), 2),
        "capture_inr": round(sum(r["capture_inr"] for r in ongoing_rows), 2),
        "trips": len(ongoing_rows),
    }
    ongoing["margin_pct"] = _margin_pct(ongoing["revenue_inr"], ongoing["cost_inr"])

    # Full FY calendar (Apr→Mar), including zero months for consistent ordering
    monthly_series: List[Dict[str, Any]] = []
    for key in fy_months:
        b = buckets[key]
        cost = round(b["cost_inr"], 2)
        revenue = round(b["revenue_inr"], 2)
        capture = round(b["capture_inr"], 2)
        teu = round(b["teu"], 2)
        monthly_series.append({
            "month": key,
            "label": _month_label(key),
            "short_label": _month_label(key, short=True),
            "trips": int(b["trips"]),
            "cost_inr": cost,
            "revenue_inr": revenue,
            "capture_inr": capture,
            "margin_pct": _margin_pct(revenue, cost),
            "teu": teu,
            "containers": int(b["containers"]),
        })

    # Container type × month TEU matrix (SOB-settled FY rows)
    matrix_types: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {m: 0.0 for m in fy_months}
    )
    matrix_counts: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {m: 0 for m in fy_months}
    )
    for row in fy_rows:
        ctype = (row.get("container_type") or "Unknown").strip() or "Unknown"
        month = row.get("sob_month")
        if not month or month not in fy_months:
            continue
        matrix_types[ctype][month] += float(row.get("teu") or 0)
        matrix_counts[ctype][month] += int(row.get("container_count") or 0)

    container_matrix = []
    for ctype in sorted(matrix_types.keys(), key=lambda t: (t == "Unknown", t)):
        month_teus = {
            m: round(matrix_types[ctype][m], 2) for m in fy_months
        }
        month_containers = {
            m: int(matrix_counts[ctype][m]) for m in fy_months
        }
        container_matrix.append({
            "container_type": ctype,
            "teu_factor": teu_factor_for_container_type(
                None if ctype == "Unknown" else ctype
            ),
            "months": month_teus,
            "containers": month_containers,
            "total_teu": round(sum(month_teus.values()), 2),
            "total_containers": sum(month_containers.values()),
        })

    monthly_teu_series = [
        {
            "month": m["month"],
            "label": m["label"],
            "short_label": m["short_label"],
            "teu": m["teu"],
            "containers": m["containers"],
            "trips": m["trips"],
        }
        for m in monthly_series
    ]

    # Apply table/KPI filters within FY (SOB-settled only for net)
    has_month_filter = bool(range_from or range_to)
    if has_month_filter:
        filtered = [
            r
            for r in fy_rows
            if _month_in_fy_range(r.get("sob_month"), range_from, range_to, fy_months)
        ]
    else:
        filtered = fy_rows

    for row in filtered:
        row["economics_status"] = "final"

    total_cost = sum(r["cost_inr"] for r in filtered)
    total_revenue = sum(r["revenue_inr"] for r in filtered)
    capture_total = round(total_revenue - total_cost, 2)
    total_teu = round(sum(float(r.get("teu") or 0) for r in filtered), 2)
    total_containers = sum(int(r.get("container_count") or 0) for r in filtered)
    valid_enquiries = sum(1 for r in filtered if r.get("master_number"))
    adhoc_count = len(filtered) - valid_enquiries
    unrealized_revenue = round(
        sum(r["revenue_inr"] for r in filtered if not r.get("master_number")),
        2,
    )

    # Gross margin = net (SOB-settled) + ongoing pipeline; skip ongoing when month-filtered
    include_ongoing = not has_month_filter
    ongoing_cost = ongoing["cost_inr"] if include_ongoing else 0.0
    ongoing_revenue = ongoing["revenue_inr"] if include_ongoing else 0.0
    ongoing_capture = ongoing["capture_inr"] if include_ongoing else 0.0
    gross_cost = round(total_cost + ongoing_cost, 2)
    gross_revenue = round(total_revenue + ongoing_revenue, 2)
    gross_margin = round(capture_total + ongoing_capture, 2)

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
    # Ensure current selected FY is always listed
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
            "contracted_count": valid_enquiries,
            "adhoc_count": adhoc_count,
            "total_cost_inr": round(total_cost, 2),
            "total_revenue_inr": round(total_revenue, 2),
            "unrealized_revenue_inr": unrealized_revenue,
            "capture_inr": capture_total,
            "margin_pct": _margin_pct(total_revenue, total_cost),
            "total_teu": total_teu,
            "total_containers": total_containers,
            "gross_margin_inr": gross_margin,
            "gross_margin_pct": _margin_pct(gross_revenue, gross_cost),
            "filter_month": month,
            "filter_month_from": range_from,
            "filter_month_to": range_to,
            "filter_metric": metric_key,
            "filter_fy": selected_label,
            "fy_label": f"FY {selected_label}",
            "fy_range": f"Apr {fy_start} – Mar {fy_start + 1}",
            "pending_no_sob": pending_no_sob,
            "ongoing": {
                **ongoing,
                "included_in_gross": include_ongoing,
            },
            "sparklines": {
                "trips": cum_trips,
                "revenue": cum_revenue,
                "cost": cum_cost,
                "margin": cum_margin,
            },
        },
        "monthly_series": monthly_series,
        "monthly_teu_series": monthly_teu_series,
        "container_matrix": container_matrix,
        "available_months": available_months,
        "available_financial_years": available_financial_years,
        "enquiries": filtered,
        "ongoing_enquiries": ongoing_rows if include_ongoing else [],
    }
