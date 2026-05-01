"""
Utility: strip the branch suffix from a client name stored in enquiry.client_name.

Convention:
    Single-branch company  →  stored as "Acme Corp"           → returns "Acme Corp"
    Main branch            →  stored as "Acme Corp_Main"       → returns "Acme Corp"
    City branch            →  stored as "Acme Corp_Mumbai"     → returns "Acme Corp"

The rule is: if the name contains an underscore, everything after the LAST underscore
is treated as the branch suffix and is stripped.  This mirrors the frontend labelling
logic in enquiry.js.
"""

def strip_branch_suffix(client_name: str) -> str:
    """Return the base company name without any branch suffix."""
    if not client_name:
        return client_name or ""
    if "_" in client_name:
        return client_name.rsplit("_", 1)[0]
    return client_name
