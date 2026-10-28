"""Bank details shown on invoice PDFs (INR vs USD settlement accounts)."""
from __future__ import annotations

from typing import Literal

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


def normalize_bank_account_key(value: str | None) -> BankAccountKey:
    key = (value or "inr").strip().lower()
    return "usd" if key == "usd" else "inr"


def invoice_bank_details_html(account_key: str | None) -> str:
    key = normalize_bank_account_key(account_key)
    acct = INVOICE_BANK_ACCOUNTS[key]
    lines = [
        "<b><u>Bank Details for Payment</u></b><br/>",
        f"<b>Account Name:</b> {acct['account_name']}<br/>",
        f"<b>Bank Name:</b> {acct['bank_name']}<br/>",
        f"<b>Account Number:</b> {acct['account_number']}<br/>",
        f"<b>IFSC Code:</b> {acct['ifsc']}<br/>",
    ]
    if acct.get("swift"):
        lines.append(f"<b>SWIFT Code:</b> {acct['swift']}<br/>")
    if acct.get("branch"):
        lines.append(f"<b>Branch:</b> {acct['branch']}<br/>")
    if acct.get("branch_address"):
        lines.append(f"<b>Branch Address:</b> {acct['branch_address']}")
    return "".join(lines)
