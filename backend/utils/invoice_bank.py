"""Bank details shown on invoice PDFs (INR vs USD settlement accounts)."""
from __future__ import annotations

from typing import Literal, List, Tuple, Optional

BankAccountKey = Literal["inr", "usd"]

INVOICE_BANK_ACCOUNTS: dict[str, dict[str, str]] = {
    "inr": {
        "label": "INR account",
        "account_name": "LOGIPOD LOGISTICS PRIVATE LIMITED",
        "bank_name": "STATE BANK OF INDIA",
        "account_number": "44327943415",
        "ifsc": "SBIN0050933",
        "branch": "GURGAON - MID CORPORATE",
        "branch_address": "Plot No. 91, IDC, 1st Floor, MG Road, Gurgaon 122001",
    },
    "usd": {
        "label": "USD account",
        "account_name": "LOGIPOD LOGISTICS PRIVATE LIMITED",
        "bank_name": "STATE BANK OF INDIA",
        "account_number": "45672491839",
        "ifsc": "SBIN0050933",
        "swift": "SBININBBP53",
        "branch": "GURGAON - MID CORPORATE",
        "branch_address": "Plot No. 91, IDC, 1st Floor, MG Road, Gurgaon 122001",
    },
}

# Row kinds for PDF table builder: ("label", "value") or ("__title__", text) or ("__gap__", "")
BankTableRow = Tuple[str, str]


def normalize_bank_account_key(value: str | None) -> BankAccountKey:
    key = (value or "inr").strip().lower()
    return "usd" if key == "usd" else "inr"


def _account_field_rows(acct: dict[str, str]) -> List[BankTableRow]:
    rows: List[BankTableRow] = [
        ("Account Name", acct["account_name"]),
        ("Bank Name", acct["bank_name"]),
        ("Account Number", acct["account_number"]),
        ("IFSC Code", acct["ifsc"]),
    ]
    if acct.get("swift"):
        rows.append(("SWIFT Code", acct["swift"]))
    if acct.get("branch"):
        rows.append(("Branch", acct["branch"]))
    if acct.get("branch_address"):
        rows.append(("Branch Address", acct["branch_address"]))
    return rows


def pdf_bank_table_rows(
    *,
    include_usd_section: bool,
    usd_only: bool = False,
) -> List[BankTableRow]:
    """
    Build label/value rows for the invoice PDF bank block.
    - INR-only invoice: INR account rows under one title.
    - USD-only invoice: USD account rows (incl. SWIFT).
    - Mixed or INR invoice with USD charges: INR block, gap, then USD extra block.
    """
    rows: List[BankTableRow] = []
    if usd_only:
        rows.append(("__title__", "Bank Details for Payment"))
        rows.extend(_account_field_rows(INVOICE_BANK_ACCOUNTS["usd"]))
        return rows

    rows.append(("__title__", "Bank Details for Payment"))
    rows.extend(_account_field_rows(INVOICE_BANK_ACCOUNTS["inr"]))

    if include_usd_section:
        rows.append(("__gap__", ""))
        rows.append(("__title__", "USD account (remittance in USD)"))
        usd = INVOICE_BANK_ACCOUNTS["usd"]
        rows.extend(
            [
                ("Account Name", usd["account_name"]),
                ("Bank Name", usd["bank_name"]),
                ("Account Number", usd["account_number"]),
                ("IFSC Code", usd["ifsc"]),
                ("SWIFT Code", usd.get("swift") or ""),
            ]
        )
    return rows


def invoice_bank_details_html(account_key: str | None) -> str:
    """Legacy single-block HTML (kept for compatibility)."""
    key = normalize_bank_account_key(account_key)
    usd_only = key == "usd"
    rows = pdf_bank_table_rows(include_usd_section=False, usd_only=usd_only)
    parts: List[str] = []
    for kind, text in rows:
        if kind == "__title__":
            parts.append(f"<b><u>{text}</u></b><br/>")
        elif kind == "__gap__":
            parts.append("<br/>")
        else:
            parts.append(f"<b>{kind}:</b> {text}<br/>")
    return "".join(parts)
