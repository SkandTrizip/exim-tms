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


def build_consignor_block(enquiry_client_name: str, master=None, origin=None) -> str:
    """Multi-line consignor block: name, address, phone, email (from client master/origin)."""
    lines = []

    def add(line):
        if line and str(line).strip():
            lines.append(str(line).strip())

    if master:
        add(master.client_name)
        add(master.office_address)
        loc = ", ".join(x for x in [master.office_location, master.country, master.pin_code] if x)
        if loc and (not master.office_address or loc not in (master.office_address or "")):
            add(loc)
        if master.contact_person:
            add(master.contact_person)
        if master.contact_no:
            add(f"Tel: {master.contact_no}")
        if master.email_id:
            add(f"Email: {master.email_id}")
    elif origin:
        add(origin.unique_client_name)
        add(origin.office_address)
        loc = ", ".join(x for x in [origin.office_location, origin.country, origin.pin_code] if x)
        if loc and (not origin.office_address or loc not in (origin.office_address or "")):
            add(loc)
        if origin.contact_person:
            add(origin.contact_person)
        if origin.contact_no:
            add(f"Tel: {origin.contact_no}")
        if origin.email_id:
            add(f"Email: {origin.email_id}")
    else:
        add(enquiry_client_name)

    return "\n".join(lines)
