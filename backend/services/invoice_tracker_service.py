"""Invoice payment due tracking and collection analytics."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from backend.models.enquiry import Enquiry
from backend.models.invoice import Invoice
from backend.utils.invoice_payment import is_payment_received

IST = ZoneInfo("Asia/Kolkata")


def today_ist() -> date:
    return datetime.now(IST).date()


def _days_remaining(due: Optional[date], today: date) -> Optional[int]:
    if due is None:
        return None
    return (due - today).days


def actual_collection_period_days(inv: Invoice) -> Optional[int]:
    """Payment date − invoice date (days to receive payment)."""
    if not is_payment_received(inv):
        return None
    if not inv.invoice_date or not inv.payment_date:
        return None
    return (inv.payment_date - inv.invoice_date).days


def stated_credit_period_days(inv: Invoice) -> Optional[int]:
    """Due date − invoice date (days allowed before payment is due)."""
    if not inv.invoice_date or not inv.payment_due_date:
        return None
    return (inv.payment_due_date - inv.invoice_date).days


def payment_delay_days(inv: Invoice) -> Optional[int]:
    """
    Average days delinquent (ADD) per invoice:
    actual collection period − stated credit period (= payment date − due date).
    0 = paid on due date; positive = late; negative = early.
    """
    if not is_payment_received(inv):
        return None
    actual = actual_collection_period_days(inv)
    stated = stated_credit_period_days(inv)
    if actual is None or stated is None:
        return None
    return actual - stated


def _timing_bucket(
    is_paid: bool,
    payment_due_date: Optional[date],
    payment_date: Optional[date],
    today: date,
) -> str:
    """
    early | on_time | late | unknown | overdue_unpaid | pending

    Paid timing uses payment delay (payment date − due date).
    """
    if is_paid:
        if payment_due_date is None or payment_date is None:
            return "unknown"
        delay = (payment_date - payment_due_date).days
        if delay < 0:
            return "early"
        if delay == 0:
            return "on_time"
        return "late"
    if payment_due_date is not None and payment_due_date < today:
        return "overdue_unpaid"
    return "pending"


def _serialize_invoice_row(
    inv: Invoice,
    enquiry_number: str,
    client_name: str,
    origin: str,
    destination: str,
    today: date,
    due_soon_days: int = 5,
) -> Dict[str, Any]:
    due = inv.payment_due_date
    days = _days_remaining(due, today)
    paid = is_payment_received(inv)
    timing = _timing_bucket(paid, due, inv.payment_date, today)

    urgency = "paid"
    if not paid:
        if days is not None and days < 0:
            urgency = "past_due"
        elif days is not None and 0 <= days <= due_soon_days:
            urgency = "due_soon"
        else:
            urgency = "upcoming"

    stated = stated_credit_period_days(inv)
    actual = actual_collection_period_days(inv) if paid else None
    delay = payment_delay_days(inv) if paid else None

    return {
        "id": inv.id,
        "enquiry_id": inv.enquiry_id,
        "enquiry_number": enquiry_number,
        "client_name": client_name or "",
        "origin": origin or "",
        "destination": destination or "",
        "invoice_number": inv.invoice_number,
        "invoice_date": inv.invoice_date,
        "payment_due_date": due,
        "is_paid": paid,
        "payment_date": inv.payment_date,
        "received_amount": inv.received_amount,
        "item_type": getattr(inv, "item_type", "all") or "all",
        "currency_mode": getattr(inv, "currency_mode", None),
        "remark": getattr(inv, "remark", None),
        "stated_credit_period_days": stated,
        "actual_collection_period_days": actual,
        "payment_delay_days": delay,
        "days_remaining": days,
        "days_overdue": abs(days) if days is not None and days < 0 else 0,
        "timing": timing,
        "urgency": urgency,
    }


def get_invoice_tracker_dashboard(
    db: Session,
    *,
    due_soon_days: int = 5,
    client_name: Optional[str] = None,
    months_back: int = 12,
) -> Dict[str, Any]:
    due_soon_days = max(0, min(due_soon_days, 30))
    months_back = max(1, min(months_back, 36))
    today = today_ist()

    q = (
        db.query(
            Invoice,
            Enquiry.enquiry_number,
            Enquiry.client_name,
            Enquiry.origin,
            Enquiry.destination,
        )
        .join(Enquiry, Invoice.enquiry_id == Enquiry.id)
        .filter(Enquiry.is_void == False)  # noqa: E712
    )
    if client_name and client_name.strip():
        q = q.filter(Enquiry.client_name.ilike(f"%{client_name.strip()}%"))

    rows = q.order_by(Invoice.payment_due_date.asc().nullslast(), Invoice.created_at.desc()).all()

    past_due: List[Dict[str, Any]] = []
    due_soon: List[Dict[str, Any]] = []
    open_upcoming: List[Dict[str, Any]] = []

    collection_early = 0
    collection_on_time = 0
    collection_late = 0
    collection_unknown = 0
    overdue_unpaid_count = 0
    pending_not_due_count = 0

    by_month: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {"early": 0, "on_time": 0, "late": 0, "unknown": 0, "invoiced_count": 0}
    )
    by_client: Dict[str, Dict[str, int]] = defaultdict(
        lambda: {
            "early": 0,
            "on_time": 0,
            "late": 0,
            "overdue_open": 0,
            "due_soon_open": 0,
            "pending_open": 0,
            "paid_count": 0,
        }
    )

    for inv, enq_num, client, origin, dest in rows:
        paid = is_payment_received(inv)
        item = _serialize_invoice_row(
            inv, enq_num, client, origin, dest, today, due_soon_days=due_soon_days
        )
        client_key = (client or "Unknown").strip() or "Unknown"

        if not paid:
            if item["urgency"] == "past_due":
                past_due.append(item)
                by_client[client_key]["overdue_open"] += 1
                overdue_unpaid_count += 1
            elif item["urgency"] == "due_soon":
                due_soon.append(item)
                by_client[client_key]["due_soon_open"] += 1
            else:
                open_upcoming.append(item)
                by_client[client_key]["pending_open"] += 1
                pending_not_due_count += 1
        else:
            by_client[client_key]["paid_count"] += 1

        timing = item["timing"]
        if timing == "early":
            collection_early += 1
            by_client[client_key]["early"] += 1
        elif timing == "on_time":
            collection_on_time += 1
            by_client[client_key]["on_time"] += 1
        elif timing == "late":
            collection_late += 1
            by_client[client_key]["late"] += 1
        elif timing == "unknown" and paid:
            collection_unknown += 1

        inv_date = inv.invoice_date or inv.payment_due_date
        if inv_date and paid:
            month_key = inv_date.strftime("%Y-%m")
            by_month[month_key]["invoiced_count"] += 1
            if timing == "early":
                by_month[month_key]["early"] += 1
            elif timing == "on_time":
                by_month[month_key]["on_time"] += 1
            elif timing == "late":
                by_month[month_key]["late"] += 1
            else:
                by_month[month_key]["unknown"] += 1

    def _sort_open_key(row: Dict[str, Any]) -> tuple:
        da = row.get("days_remaining")
        return (da is None, da if da is not None else 0)

    past_due.sort(key=_sort_open_key)
    due_soon.sort(key=_sort_open_key)
    open_upcoming.sort(key=_sort_open_key)

    month_series = _build_month_series(by_month, months_back, today)

    client_series = sorted(
        [
            {
                "client_name": name,
                **counts,
                "on_time_pct": _pct(
                    counts["on_time"],
                    counts["early"] + counts["on_time"] + counts["late"],
                ),
            }
            for name, counts in by_client.items()
            if counts["paid_count"] > 0
                or counts["overdue_open"] > 0
                or counts["due_soon_open"] > 0
                or counts["pending_open"] > 0
        ],
        key=lambda c: (-(c["overdue_open"] + c["due_soon_open"]), c["client_name"]),
    )

    open_count = overdue_unpaid_count + len(due_soon) + len(open_upcoming)
    paid_with_timing = collection_early + collection_on_time + collection_late

    actual_periods: List[int] = []
    stated_periods: List[int] = []
    payment_delays: List[int] = []
    for inv, *_ in rows:
        actual = actual_collection_period_days(inv)
        stated = stated_credit_period_days(inv)
        delay = payment_delay_days(inv)
        if actual is None or stated is None or delay is None:
            continue
        actual_periods.append(actual)
        stated_periods.append(stated)
        payment_delays.append(delay)

    avg_actual_collection = _avg(actual_periods)
    avg_stated_credit = _avg(stated_periods)
    avg_payment_delay = _avg(payment_delays)

    return {
        "as_of": today.isoformat(),
        "due_soon_days": due_soon_days,
        "summary": {
            "total_invoices": len(rows),
            "open_count": open_count,
            "past_due_count": len(past_due),
            "due_within_days_count": len(due_soon),
            "due_soon_days": due_soon_days,
            "overdue_unpaid_count": overdue_unpaid_count,
            "pending_not_due_count": pending_not_due_count,
            "paid_count": sum(1 for inv, *_ in rows if is_payment_received(inv)),
            "early_paid_count": collection_early,
            "on_time_paid_count": collection_on_time,
            "late_paid_count": collection_late,
            "on_time_rate_pct": _pct(collection_on_time, paid_with_timing),
            "not_late_rate_pct": _pct(
                collection_early + collection_on_time, paid_with_timing
            ),
            "avg_actual_collection_period_days": avg_actual_collection,
            "avg_stated_credit_period_days": avg_stated_credit,
            "avg_payment_delay_days": avg_payment_delay,
            "avg_days_to_payment_received": avg_actual_collection,
            "avg_credit_period_days": avg_stated_credit,
            "metrics_sample_count": len(actual_periods),
            "avg_payment_sample_count": len(actual_periods),
            "avg_credit_sample_count": len(stated_periods),
        },
        "past_due": past_due,
        "due_soon": due_soon,
        "open_upcoming": open_upcoming,
        "analytics": {
            "collection": {
                "early": collection_early,
                "on_time": collection_on_time,
                "late": collection_late,
                "unknown": collection_unknown,
                "overdue_unpaid": overdue_unpaid_count,
                "pending_not_due": pending_not_due_count,
            },
            "by_month": month_series,
            "by_client": client_series[:50],
        },
        "clients": sorted({(c or "").strip() for _, _, c, _, _ in rows if c}),
    }


def _pct(numerator: int, denominator: int) -> Optional[float]:
    if denominator <= 0:
        return None
    return round(100.0 * numerator / denominator, 1)


def _avg(values: List[int]) -> Optional[float]:
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def _build_month_series(
    by_month: Dict[str, Dict[str, int]],
    months_back: int,
    today: date,
) -> List[Dict[str, Any]]:
    """Last N calendar months including current, ascending."""
    keys: List[str] = []
    y, m = today.year, today.month
    for _ in range(months_back):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    keys.reverse()

    out: List[Dict[str, Any]] = []
    for key in keys:
        bucket = by_month.get(
            key,
            {"early": 0, "on_time": 0, "late": 0, "unknown": 0, "invoiced_count": 0},
        )
        paid = bucket["early"] + bucket["on_time"] + bucket["late"] + bucket["unknown"]
        timed = bucket["early"] + bucket["on_time"] + bucket["late"]
        out.append(
            {
                "month": key,
                "label": _month_label(key),
                "early": bucket["early"],
                "on_time": bucket["on_time"],
                "late": bucket["late"],
                "unknown": bucket["unknown"],
                "invoiced_count": bucket["invoiced_count"],
                "on_time_pct": _pct(bucket["on_time"], timed),
            }
        )
    return out


def _month_label(ym: str) -> str:
    try:
        y, m = ym.split("-")
        dt = date(int(y), int(m), 1)
        return dt.strftime("%b %Y")
    except (ValueError, TypeError):
        return ym
