from datetime import date

from backend.services.invoice_tracker_service import (
    _timing_bucket,
    _days_remaining,
    _pct,
)


def test_days_remaining():
    today = date(2026, 10, 26)
    assert _days_remaining(date(2026, 10, 28), today) == 2
    assert _days_remaining(date(2026, 10, 20), today) == -6


def test_timing_bucket_on_time_and_late():
    today = date(2026, 10, 26)
    assert _timing_bucket(True, date(2026, 10, 30), date(2026, 10, 29), today) == "on_time"
    assert _timing_bucket(True, date(2026, 10, 30), date(2026, 11, 1), today) == "late"
    assert _timing_bucket(False, date(2026, 10, 20), None, today) == "overdue_unpaid"
    assert _timing_bucket(False, date(2026, 11, 1), None, today) == "pending"


def test_pct():
    assert _pct(3, 4) == 75.0
    assert _pct(0, 0) is None
