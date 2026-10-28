"""Bank details shown on invoice PDFs (INR vs USD settlement accounts)."""
from __future__ import annotations

from typing import Literal, List, Tuple

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

# ("label", "value") | "__title__" | "__section__" | "__gap__"
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


def pdf_bank_table_rows() -> List[BankTableRow]:
    """Both INR and USD accounts under one Bank Details for Payment block."""
    rows: List[BankTableRow] = [
        ("__title__", "Bank Details for Payment"),
        ("__section__", "INR account details"),
    ]
    rows.extend(_account_field_rows(INVOICE_BANK_ACCOUNTS["inr"]))
    rows.append(("__gap__", ""))
    rows.append(("__section__", "USD account details"))
    rows.extend(_account_field_rows(INVOICE_BANK_ACCOUNTS["usd"]))
    return rows


def pdf_bank_details_html(rows: List[BankTableRow] | None = None) -> str:
    """Single-cell bank block HTML (original invoice layout)."""
    row_list = rows if rows is not None else pdf_bank_table_rows()
    parts: List[str] = []
    for kind, text in row_list:
        if kind == "__title__":
            parts.append(f"<b><u>{text}</u></b><br/>")
        elif kind == "__section__":
            parts.append(f"<b>{text}</b><br/>")
        elif kind == "__gap__":
            parts.append("<br/><br/>")
        else:
            parts.append(f"<b>{kind}:</b> {text}<br/>")
    return "".join(parts)


def invoice_bank_details_html(account_key: str | None = None) -> str:
    return pdf_bank_details_html()
