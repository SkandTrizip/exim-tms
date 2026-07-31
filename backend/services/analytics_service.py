"""Dashboard analytics from enquiry_economics (synced from final quote + additional invoices)."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.models.enquiry import Enquiry
from backend.models.enquiry_economics import EnquiryEconomics
from backend.models.final_quote import FinalQuote
from backend.models.shipment_status import ShipmentStatus

_MONTH_NAMES = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

# From July 2026 onward: attribute by SI date; net needs final quote;
# ongoing/gross pipeline = SI submitted without final quote.
# Before that: any economics row counts (no SI / final-quote gate),
# and June-created jobs stay out of July even if SI was marked later.
_MODERN_MARGIN_CUTOFF = date(2026, 7, 1)

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
    except (ValueError, IndexError):
        return key
    try:
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


def _as_date(value) -> Optional[date]:
    if not value:
        return None
    return value.date() if hasattr(value, "date") else value


def _month_in_fy_range(
    month_key: Optional[str],
    month_from: Optional[str],
    month_to: Optional[str],
    fy_months: List[str],
) -> bool:
    """True when month_key falls within the selected month filter.

    - Neither bound set → all FY months
    - Only one bound set → that single month
    - Both set → inclusive forward range in FY order (Apr→Mar)
    - If from is after to in FY order → invalid, matches nothing
    """
    if not month_key or month_key not in fy_months:
        return False
    if not month_from and not month_to:
        return True
    if month_from and not month_to:
        return month_key == month_from
    if month_to and not month_from:
        return month_key == month_to
    if month_from not in fy_months or month_to not in fy_months:
        return False
    start_idx = fy_months.index(month_from)
    end_idx = fy_months.index(month_to)
    if start_idx > end_idx:
        return False
    idx = fy_months.index(month_key)
    return start_idx <= idx <= end_idx


def _normalize_month_bounds(
    month_from: Optional[str],
    month_to: Optional[str],
    fy_months: List[str],
) -> Tuple[Optional[str], Optional[str]]:
    """Drop unknown keys; leave backward ranges intact for empty-match handling."""
    range_from = month_from if month_from in fy_months else None
    range_to = month_to if month_to in fy_months else None
    return range_from, range_to


def _resolve_attribution(
    *,
    economics: EnquiryEconomics,
    shipment: Optional[ShipmentStatus],
    enquiry: Enquiry,
) -> Tuple[Optional[date], bool, Optional[date]]:
    """
    Return (attribution_date, is_legacy, si_date).

    Legacy (enquiry created before July 2026):
      Month = SOB → created_at (keeps June jobs out of July even if SI is later).
      No final-quote / SI gate for margin.

    Modern (created on/after July 2026):
      Month = SI submitted date.
      Net requires final quote; ongoing = SI without final quote.
    """
    created = _as_date(getattr(enquiry, "created_at", None))
    is_legacy = created is not None and created < _MODERN_MARGIN_CUTOFF

    si_date = _as_date(getattr(economics, "si_date", None))
    if si_date is None and shipment is not None:
        si_date = _as_date(shipment.si_submitted)

    sob_date = _as_date(getattr(economics, "sob_date", None))
    if sob_date is None and shipment is not None:
        sob_date = _as_date(shipment.sob)

    if is_legacy:
        # Prefer pre-July dates so June-created jobs never land in July+.
        candidates = [d for d in (sob_date, created, si_date) if d is not None]
        pre_july = [d for d in candidates if d < _MODERN_MARGIN_CUTOFF]
        if pre_july:
            # Prefer SOB among pre-July dates, then created, then SI.
            for preferred in (sob_date, created, si_date):
                if preferred is not None and preferred < _MODERN_MARGIN_CUTOFF:
                    return preferred, True, si_date
        # No pre-July date at all — fall back to created/SOB/SI.
        attr = sob_date or created or si_date
        return attr, True, si_date

    return si_date, False, si_date


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
    Build analytics summary, per-enquiry rows, and FY month-wise series.

    From July 2026 (enquiries created on/after 2026-07-01):
      Net = final-quote trips, attributed by SI submitted date.
      Gross = net + ongoing (SI submitted, no final quote).
      June-created enquiries are excluded from July+ months.

    Before July 2026 (legacy):
      Any economics row counts toward margin — no final-quote / SI gate.
      Month attribution: SOB → created_at (capped before July).

    Filters:
      - fy: '2026-27' Indian financial year (Apr–Mar)
      - month: 'YYYY-MM' — single month (legacy; overrides month_from/month_to)
      - month_from / month_to: inclusive month range within FY
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
    range_from, range_to = _normalize_month_bounds(range_from, range_to, fy_months)
    has_month_filter = bool(range_from or range_to)

    rows_q = (
        db.query(EnquiryEconomics, Enquiry, ShipmentStatus)
        .join(Enquiry, Enquiry.id == EnquiryEconomics.enquiry_id)
        .outerjoin(ShipmentStatus, ShipmentStatus.enquiry_id == Enquiry.id)
        .filter(Enquiry.is_void == False)
        .order_by(EnquiryEconomics.updated_at.desc(), EnquiryEconomics.id.desc())
        .all()
    )

    all_enquiry_ids = [enquiry.id for _, enquiry, _ in rows_q]
    final_ids: set[int] = set()
    if all_enquiry_ids:
        final_ids = {
            row[0]
            for row in db.query(FinalQuote.enquiry_id)
            .filter(FinalQuote.enquiry_id.in_(all_enquiry_ids))
            .distinct()
            .all()
        }

    all_rows: List[Dict[str, Any]] = []
    fy_years_seen = {fy_start}

    for economics, enquiry, shipment in rows_q:
        cost = round(float(economics.cost_inr or 0), 2)
        revenue = round(float(economics.revenue_inr or 0), 2)
        capture = round(revenue - cost, 2)
        master_number = (shipment.master_number or "").strip() if shipment else ""

        attr_date, is_legacy, si_date = _resolve_attribution(
            economics=economics,
            shipment=shipment,
            enquiry=enquiry,
        )
        attr_month = _month_key(attr_date)
        if attr_date:
            fy_years_seen.add(_fy_start_for_date(attr_date))

        has_final = enquiry.id in final_ids
        if is_legacy:
            status = "final"
        elif has_final and si_date is not None:
            status = "final"
        elif si_date is not None and not has_final:
            status = "ongoing"
        else:
            status = "pending"

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
            "si_date": attr_date.isoformat() if attr_date else None,
            "si_month": attr_month,
            # Kept for older clients; month attribution key.
            "sob_date": attr_date.isoformat() if attr_date else None,
            "sob_month": attr_month,
            "has_final_quote": has_final,
            "is_legacy": is_legacy,
            "economics_status": status,
        })

    def _in_selected_fy(row: Dict[str, Any]) -> bool:
        if not row.get("si_date"):
            return False
        return fy_start_date <= date.fromisoformat(row["si_date"]) <= fy_end_date

    # Settled / net rows
    fy_rows = [
        r for r in all_rows
        if r.get("economics_status") == "final" and _in_selected_fy(r)
    ]
    if has_month_filter:
        fy_rows = [
            r
            for r in fy_rows
            if _month_in_fy_range(r.get("si_month"), range_from, range_to, fy_months)
        ]

    # Ongoing (gross pipeline, modern only): SI submitted, no final quote
    ongoing_rows = [
        r for r in all_rows
        if r.get("economics_status") == "ongoing" and _in_selected_fy(r)
    ]
    if has_month_filter:
        ongoing_rows = [
            r
            for r in ongoing_rows
            if _month_in_fy_range(r.get("si_month"), range_from, range_to, fy_months)
        ]
    pending_rows = [r for r in all_rows if r.get("economics_status") == "pending"]

    if has_month_filter:
        if range_from and not range_to:
            series_months = [range_from]
        elif range_to and not range_from:
            series_months = [range_to]
        elif range_from and range_to:
            start_idx = fy_months.index(range_from)
            end_idx = fy_months.index(range_to)
            series_months = (
                fy_months[start_idx : end_idx + 1] if start_idx <= end_idx else []
            )
        else:
            series_months = list(fy_months)
    else:
        series_months = list(fy_months)

    buckets: Dict[str, Dict[str, float]] = {
        key: {
            "cost_inr": 0.0,
            "revenue_inr": 0.0,
            "capture_inr": 0.0,
            "trips": 0,
            "teu": 0.0,
            "containers": 0,
        }
        for key in series_months
    }

    for row in fy_rows:
        key = row["si_month"]
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

    monthly_series: List[Dict[str, Any]] = []
    for key in series_months:
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

    matrix_types: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {m: 0.0 for m in series_months}
    )
    matrix_counts: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {m: 0 for m in series_months}
    )
    for row in fy_rows:
        ctype = (row.get("container_type") or "Unknown").strip() or "Unknown"
        month_key = row.get("si_month")
        if not month_key or month_key not in series_months:
            continue
        matrix_types[ctype][month_key] += float(row.get("teu") or 0)
        matrix_counts[ctype][month_key] += int(row.get("container_count") or 0)

    container_matrix = []
    for ctype in sorted(matrix_types.keys(), key=lambda t: (t == "Unknown", t)):
        month_teus = {
            m: round(matrix_types[ctype][m], 2) for m in series_months
        }
        month_containers = {
            m: int(matrix_counts[ctype][m]) for m in series_months
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

    # Gross = net + ongoing (SI submitted, no final quote), including month-filtered
    include_ongoing = True
    ongoing_cost = ongoing["cost_inr"]
    ongoing_revenue = ongoing["revenue_inr"]
    ongoing_capture = ongoing["capture_inr"]
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
        {
            "value": key,
            "label": _month_label(key),
            "short_label": _month_label(key, short=True),
        }
        for key in fy_months
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
            "gross_cost_inr": gross_cost,
            "gross_revenue_inr": gross_revenue,
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
        "ongoing_enquiries": ongoing_rows,
    }
