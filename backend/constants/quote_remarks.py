"""Valid quote remark reason codes (pricing finalize & final quote revision)."""

from typing import Optional, Tuple

QUOTE_REMARK_REASONS = {
    "currency_rate",
    "ssr_request",
    "telex_surrender",
    "detention",
    "booking_rollover",
    "bill_discount",
    "other",
}

QUOTE_REMARK_LABELS = {
    "currency_rate": "Change in Currency Rate",
    "ssr_request": "Additional Charges - SSR Request",
    "telex_surrender": "Additional Charges - Telex/Surrender Charges",
    "detention": "Additional Charges - Detention",
    "booking_rollover": "Booking Rollover Charges",
    "bill_discount": "Bill Discounted Offered",
    "other": "Other Reason",
}


def validate_quote_remarks(reason: Optional[str], other: Optional[str]) -> Tuple[str, Optional[str]]:
    if not reason or reason not in QUOTE_REMARK_REASONS:
        raise ValueError(
            "remarks_reason is required and must be one of: "
            + ", ".join(sorted(QUOTE_REMARK_REASONS))
        )
    other_text = (other or "").strip() or None
    if reason == "other" and not other_text:
        raise ValueError("remarks_other is required when reason is 'other'")
    return reason, other_text
