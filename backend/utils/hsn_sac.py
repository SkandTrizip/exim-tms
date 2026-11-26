"""HSN/SAC defaults for charge lines (aligned with invoice PDF logic)."""

from __future__ import annotations

from typing import Optional


def default_hsn_sac_for_description(charge_description: Optional[str]) -> str:
    desc_lower = (charge_description or "").lower()
    if "air freight" in desc_lower:
        return "996531"
    if "ocean freight" in desc_lower or "freight" in desc_lower:
        return "996521"
    if "bl fee" in desc_lower or "bl charge" in desc_lower:
        return "996799"
    if "origin thc" in desc_lower or "origin terminal" in desc_lower:
        return "996711"
    if "seal charge" in desc_lower or "seal fee" in desc_lower:
        return "996799"
    if "facilitation" in desc_lower:
        return "996711"
    return "996511"


def resolve_hsn_sac(
    charge_description: Optional[str],
    stored: Optional[str] = None,
) -> str:
    if stored is not None and str(stored).strip():
        return str(stored).strip()
    return default_hsn_sac_for_description(charge_description)
