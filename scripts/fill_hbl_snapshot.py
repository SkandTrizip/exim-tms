#!/usr/bin/env python3
"""
Push a saved HBL / MTD snapshot to the TMS so the document opens pre-filled.

Usage:
  python scripts/fill_hbl_snapshot.py --data scripts/hbl-snapshot.example.json
  python scripts/fill_hbl_snapshot.py --data my-hbl.json --api-url http://localhost:8000
  python scripts/fill_hbl_snapshot.py --enquiry-number LLP/OFE/26/06/00014 --merge-api --data my-hbl.json

JSON format: see scripts/hbl-snapshot.example.json
  - enquiry_number (required if not passed via --enquiry-number)
  - fields: dict of HBL field ids → text (same ids as the HBL form)
  - optional: blType, draftMark, watermarkEnabled, applySign, freight

After running, open Generate HBL → search the job number → Open HBL.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


def http_json(method: str, url: str, body: dict | None = None, timeout: int = 30) -> tuple[int, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = raw
        return e.code, detail


HBL_FIELD_IDS = [
    "mtdBlNo", "consignor", "shipmentRefNo", "consignee", "deliveryAgent",
    "notifyParty1", "notifyParty2", "placeAcceptance", "portLoading", "dateAcceptance",
    "portDischarge", "placeDelivery", "routeTranshipment", "vesselName", "voyageNo",
    "modesTransport", "dateDelivery", "containerNos", "marksNumber", "cargoDescription",
    "cargoWeight", "cargoMeasurement", "sobDate", "placeAndDateOfIssue", "endOfBlNo",
]


def fmt_date(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%d %b %Y")
    except ValueError:
        return ""


def fields_from_api(doc: dict[str, Any]) -> dict[str, str]:
    """Build default field text from GET /api/enquiry/hbl-document/{id} (same as the UI)."""
    origin = doc.get("origin") or ""
    dest = doc.get("destination") or ""
    ref = doc.get("enquiry_number") or ""

    desc_parts = []
    if doc.get("commodity"):
        desc_parts.append(doc["commodity"])
    if doc.get("hs_code"):
        desc_parts.append(f"HS Code: {doc['hs_code']}")

    wt_lines = []
    wpc = doc.get("weight_per_container")
    if wpc:
        unit = doc.get("weight_measurement") or "KG"
        wt_lines.append(f"{wpc} {unit}")
        count = doc.get("container_count") or 0
        if count and count > 1:
            wt_lines.append(f"Total: {wpc * count} {unit}")

    container_info = []
    if doc.get("container_type"):
        container_info.append(doc["container_type"])
    if doc.get("container_count"):
        container_info.append(f"× {doc['container_count']}")

    today = datetime.now().strftime("%d %b %Y")

    return {
        "mtdBlNo": ref,
        "shipmentRefNo": ref,
        "endOfBlNo": ref,
        "consignor": doc.get("consignor") or doc.get("client_name") or "",
        "consignee": doc.get("consignee") or "",
        "deliveryAgent": doc.get("delivery_agent") or "",
        "notifyParty1": doc.get("notify_party_address") or "",
        "notifyParty2": doc.get("notify_party_2_address") or "",
        "placeAcceptance": doc.get("place_of_receipt") or origin,
        "portLoading": doc.get("port_of_loading") or doc.get("preferred_origin_port") or origin,
        "portDischarge": doc.get("port_of_discharge") or doc.get("preferred_destination_port") or dest,
        "placeDelivery": doc.get("final_place_of_delivery") or dest,
        "dateAcceptance": "",
        "routeTranshipment": "",
        "vesselName": doc.get("vessel") or "",
        "voyageNo": doc.get("voyage_no") or "",
        "modesTransport": doc.get("mode_of_transport_origin") or "",
        "dateDelivery": fmt_date(doc.get("eta")),
        "containerNos": doc.get("container_number") or "",
        "marksNumber": "",
        "cargoDescription": "\n".join(desc_parts),
        "cargoWeight": "\n".join(wt_lines),
        "cargoMeasurement": " ".join(container_info),
        "sobDate": fmt_date(doc.get("sob")),
        "placeAndDateOfIssue": f"Gurugram, {today}",
    }


def build_snapshot(
    enquiry_id: int,
    payload: dict[str, Any],
    api_fields: dict[str, str] | None = None,
) -> dict[str, Any]:
    merged = dict(api_fields or {})
    merged.update(payload.get("fields") or {})

    fields = {fid: merged.get(fid, "") for fid in HBL_FIELD_IDS}

    return {
        "version": 1,
        "savedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "enquiryId": str(enquiry_id),
        "blType": payload.get("blType", "seaway"),
        "draftMark": bool(payload.get("draftMark", False)),
        "watermarkEnabled": payload.get("watermarkEnabled", True),
        "applySign": bool(payload.get("applySign", False)),
        "freight": payload.get("freight", "prepaid"),
        "fields": fields,
    }


def lookup_enquiry(api_url: str, enquiry_number: str) -> dict[str, Any]:
    url = f"{api_url.rstrip('/')}/api/enquiry/lookup-hbl/{quote(enquiry_number, safe='')}"
    status, data = http_json("GET", url)
    if status == 404:
        status2, rows = http_json("GET", f"{api_url.rstrip('/')}/api/enquiry/")
        if status2 >= 400:
            raise SystemExit(f"API error {status2}: {rows}")
        for row in rows:
            if row.get("enquiry_number") == enquiry_number:
                return {"id": row["id"], "enquiry_number": enquiry_number}
        raise SystemExit(f"Enquiry not found: {enquiry_number}")
    if status >= 400:
        detail = data.get("detail") if isinstance(data, dict) else data
        raise SystemExit(f"Lookup failed ({status}): {detail}")
    return data


def fetch_hbl_document(api_url: str, enquiry_id: int) -> dict[str, Any]:
    url = f"{api_url.rstrip('/')}/api/enquiry/hbl-document/{enquiry_id}"
    status, data = http_json("GET", url)
    if status >= 400:
        detail = data.get("detail") if isinstance(data, dict) else data
        raise SystemExit(f"Fetch HBL document failed ({status}): {detail}")
    return data


def save_snapshot(api_url: str, enquiry_id: int, snapshot: dict[str, Any]) -> dict[str, Any]:
    url = f"{api_url.rstrip('/')}/api/enquiry/hbl-document/{enquiry_id}/snapshot"
    status, data = http_json("PUT", url, {"snapshot": snapshot})
    if status >= 400:
        detail = data.get("detail") if isinstance(data, dict) else data
        raise SystemExit(f"Save failed ({status}): {detail}")
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="Save HBL snapshot via API (no manual form fill).")
    parser.add_argument(
        "--data", "-d",
        type=Path,
        required=True,
        help="JSON file with enquiry_number and fields (see hbl-snapshot.example.json)",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:8000",
        help="TMS API base URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--enquiry-number", "-n",
        help="Override enquiry_number from JSON",
    )
    parser.add_argument(
        "--merge-api",
        action="store_true",
        help="Start from API prefill, then apply JSON field overrides",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print snapshot JSON without saving",
    )
    args = parser.parse_args()

    if not args.data.is_file():
        raise SystemExit(f"Data file not found: {args.data}")

    payload = json.loads(args.data.read_text(encoding="utf-8"))
    enquiry_number = (args.enquiry_number or payload.get("enquiry_number") or "").strip()
    if not enquiry_number:
        raise SystemExit("enquiry_number is required (--enquiry-number or in JSON)")

    lookup = lookup_enquiry(args.api_url, enquiry_number)
    enquiry_id = int(lookup["id"])

    api_fields = None
    if args.merge_api:
        doc = fetch_hbl_document(args.api_url, enquiry_id)
        api_fields = fields_from_api(doc)

    snapshot = build_snapshot(enquiry_id, payload, api_fields)

    if args.dry_run:
        print(json.dumps(snapshot, indent=2, ensure_ascii=False))
        return

    result = save_snapshot(args.api_url, enquiry_id, snapshot)
    saved_at = result.get("saved_at", "?")
    print(f"OK — HBL snapshot saved for {enquiry_number} (id={enquiry_id}) at {saved_at}")
    print(f"Open: {args.api_url.rstrip('/')}/hbl-document?enquiry_id={enquiry_id}")


if __name__ == "__main__":
    main()
