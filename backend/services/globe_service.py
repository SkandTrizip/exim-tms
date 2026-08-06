"""Shipment globe: resolve enquiry origin/destination ports to lat/lng for map arcs."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.models.enquiry import Enquiry
from backend.models.port import PortCode
from backend.models.quote import Quote

_COORD_RE = re.compile(
    r"^(\d{2})(\d{2})(\d{2})?([NS])\s+(\d{3})(\d{2})(\d{2})?([EW])$",
    re.IGNORECASE,
)

# Known ocean hubs where UN/LOCODE master is missing or ambiguous (e.g. GBSOU has no coords;
# plain "Southampton" also matches Bermuda BMSOU).
_MAJOR_PORT_OVERRIDES: Dict[str, Dict[str, Any]] = {
    "southampton": {
        "name": "Southampton",
        "unlocode": "GBSOU",
        "lat": 50.9097,
        "lng": -1.4044,
    },
    "felixstowe": {
        "name": "Felixstowe",
        "unlocode": "GBFXT",
        "lat": 51.9542,
        "lng": 1.3512,
    },
    "rotterdam": {
        "name": "Rotterdam",
        "unlocode": "NLRTM",
        "lat": 51.9225,
        "lng": 4.4792,
    },
    "hamburg": {
        "name": "Hamburg",
        "unlocode": "DEHAM",
        "lat": 53.5511,
        "lng": 9.9937,
    },
    "antwerp": {
        "name": "Antwerp",
        "unlocode": "BEANR",
        "lat": 51.2213,
        "lng": 4.4051,
    },
    "singapore": {
        "name": "Singapore",
        "unlocode": "SGSIN",
        "lat": 1.2644,
        "lng": 103.8228,
    },
    "jebel ali": {
        "name": "Jebel Ali",
        "unlocode": "AEJEA",
        "lat": 25.0118,
        "lng": 55.0617,
    },
    "nhava sheva": {
        "name": "Nhava Sheva",
        "unlocode": "INNSA",
        "lat": 18.9490,
        "lng": 72.9525,
    },
    "mundra": {
        "name": "Mundra",
        "unlocode": "INMUN",
        "lat": 22.8390,
        "lng": 69.7210,
    },
}

_PREFERRED_COUNTRY_CODES = {
    "GB", "NL", "BE", "DE", "FR", "ES", "IT", "PT", "IE",
    "IN", "AE", "SG", "CN", "HK", "KR", "JP", "TW", "MY",
    "US", "CA", "AU", "NZ", "ZA", "EG", "SA", "OM", "QA",
}


def parse_unlocode_coordinates(raw: Optional[str]) -> Optional[Tuple[float, float]]:
    """Parse UN/LOCODE DMS string like '2105N 07237E' → (lat, lng)."""
    if not raw or not str(raw).strip():
        return None
    text = " ".join(str(raw).strip().upper().replace(",", " ").split())
    match = _COORD_RE.match(text)
    if not match:
        return None

    lat_d, lat_m, lat_s, lat_h, lng_d, lng_m, lng_s, lng_h = match.groups()
    lat = int(lat_d) + int(lat_m) / 60.0 + (int(lat_s) / 3600.0 if lat_s else 0.0)
    lng = int(lng_d) + int(lng_m) / 60.0 + (int(lng_s) / 3600.0 if lng_s else 0.0)
    if lat_h == "S":
        lat = -lat
    if lng_h == "W":
        lng = -lng
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return round(lat, 5), round(lng, 5)


def _norm_name(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).strip().lower().split())


def _prefer_port_entry(
    existing: Optional[Dict[str, Any]],
    new: Dict[str, Any],
) -> Dict[str, Any]:
    if not existing:
        return new

    def score(entry: Dict[str, Any]) -> int:
        code = (entry.get("unlocode") or "").upper()
        country = code[:2] if len(code) >= 2 else ""
        name = (entry.get("name") or "").lower()
        points = 0
        if entry.get("lat") is not None and entry.get("lng") is not None:
            points += 10
        if country in _PREFERRED_COUNTRY_CODES:
            points += 8
        if "port" in name:
            points += 3
        # Deprioritize Bermuda / small-island false friends for common EU hub names
        if country in {"BM", "CA"} and name in {"southampton"}:
            points -= 20
        return points

    existing_score = score(existing)
    new_score = score(new)
    if new_score != existing_score:
        return new if new_score > existing_score else existing
    existing_name = (existing.get("name") or "").lower()
    new_name = (new.get("name") or "").lower()
    return new if len(new_name) > len(existing_name) else existing


def _override_for_label(label: Optional[str]) -> Optional[Dict[str, Any]]:
    key = _norm_name(label)
    if not key:
        return None
    if key in _MAJOR_PORT_OVERRIDES:
        return dict(_MAJOR_PORT_OVERRIDES[key])
    if "," in key:
        head = key.split(",", 1)[0].strip()
        if head in _MAJOR_PORT_OVERRIDES:
            return dict(_MAJOR_PORT_OVERRIDES[head])
    return None


def _build_port_indexes(db: Session) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """Return (by_unlocode, by_name) maps with lat/lng for ports that have coordinates."""
    by_code: Dict[str, Dict[str, Any]] = {}
    by_name: Dict[str, Dict[str, Any]] = {}

    # Seed with trusted major hubs first
    for key, entry in _MAJOR_PORT_OVERRIDES.items():
        by_name[key] = dict(entry)
        code = (entry.get("unlocode") or "").upper()
        if code:
            by_code[code] = dict(entry)

    ports = (
        db.query(PortCode.unlocode, PortCode.name, PortCode.coordinates)
        .filter(PortCode.coordinates.isnot(None), PortCode.coordinates != "")
        .all()
    )
    for unlocode, name, coordinates in ports:
        parsed = parse_unlocode_coordinates(coordinates)
        if not parsed:
            continue
        lat, lng = parsed
        entry = {
            "unlocode": unlocode,
            "name": name,
            "lat": lat,
            "lng": lng,
        }
        code_key = (unlocode or "").strip().upper()
        # Never overwrite a trusted major override by unlocode
        if code_key and code_key not in {
            (v.get("unlocode") or "").upper() for v in _MAJOR_PORT_OVERRIDES.values()
        }:
            by_code[code_key] = _prefer_port_entry(by_code.get(code_key), entry)
        elif code_key and code_key not in by_code:
            by_code[code_key] = entry

        name_key = _norm_name(name)
        # Keep override for known ambiguous city names
        if name_key and name_key not in _MAJOR_PORT_OVERRIDES:
            by_name[name_key] = _prefer_port_entry(by_name.get(name_key), entry)
        if name_key and "/" in name_key:
            short = name_key.split("/", 1)[0].strip()
            if short and short not in _MAJOR_PORT_OVERRIDES:
                by_name[short] = _prefer_port_entry(by_name.get(short), entry)
        if name_key and " " in name_key and "port" in name_key:
            first = name_key.split(" ", 1)[0].strip()
            if first and len(first) >= 4 and first not in _MAJOR_PORT_OVERRIDES:
                by_name[first] = _prefer_port_entry(by_name.get(first), entry)

    return by_code, by_name


def _resolve_location(
    *,
    label: Optional[str],
    code: Optional[str],
    preferred: Optional[str],
    by_code: Dict[str, Dict[str, Any]],
    by_name: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    for candidate in (preferred, label):
        override = _override_for_label(candidate)
        if override:
            return override

    code_key = (code or "").strip().upper()
    if code_key and code_key in by_code:
        return by_code[code_key]

    for candidate in (preferred, label):
        key = _norm_name(candidate)
        if not key:
            continue
        if key in by_name:
            return by_name[key]
        if "," in key:
            head = key.split(",", 1)[0].strip()
            if head in by_name:
                return by_name[head]
        if " - " in key:
            head = key.split(" - ", 1)[0].strip()
            if head in by_name:
                return by_name[head]
    return None


def _point_key(lat: float, lng: float, name: str) -> str:
    return f"{round(lat, 3)}:{round(lng, 3)}:{_norm_name(name)}"


def get_shipment_globe_data(db: Session) -> Dict[str, Any]:
    """
    Build globe points (origins/destinations) and route arcs from non-void enquiries
    that reached tracking (stage >= 3), resolving coordinates via port master.
    """
    by_code, by_name = _build_port_indexes(db)

    rows = (
        db.query(Enquiry, Quote)
        .outerjoin(
            Quote,
            (Quote.enquiry_id == Enquiry.id) & (Quote.status == "accepted"),
        )
        .filter(Enquiry.is_void == False, Enquiry.stage >= 3)
        .order_by(Enquiry.id.desc())
        .all()
    )

    # One row per enquiry (prefer accepted quote fields when present)
    seen_enquiry: set = set()
    origin_agg: Dict[str, Dict[str, Any]] = {}
    dest_agg: Dict[str, Dict[str, Any]] = {}
    route_agg: Dict[str, Dict[str, Any]] = {}
    unresolved = 0
    total = 0

    for enquiry, quote in rows:
        if enquiry.id in seen_enquiry:
            continue
        seen_enquiry.add(enquiry.id)
        total += 1

        origin_label = (
            (quote.port_of_loading if quote else None)
            or enquiry.preferred_origin_port
            or enquiry.origin
        )
        dest_label = (
            (quote.port_of_discharge if quote else None)
            or enquiry.preferred_destination_port
            or enquiry.destination
        )

        origin = _resolve_location(
            label=origin_label,
            code=enquiry.origin_port_code,
            preferred=enquiry.preferred_origin_port,
            by_code=by_code,
            by_name=by_name,
        )
        dest = _resolve_location(
            label=dest_label,
            code=enquiry.destination_port_code,
            preferred=enquiry.preferred_destination_port,
            by_code=by_code,
            by_name=by_name,
        )

        if not origin and not dest:
            unresolved += 1
            continue

        if origin:
            ok = _point_key(origin["lat"], origin["lng"], origin["name"])
            bucket = origin_agg.setdefault(
                ok,
                {
                    "id": ok,
                    "name": origin["name"],
                    "unlocode": origin.get("unlocode"),
                    "lat": origin["lat"],
                    "lng": origin["lng"],
                    "count": 0,
                    "kind": "origin",
                },
            )
            bucket["count"] += 1

        if dest:
            dk = _point_key(dest["lat"], dest["lng"], dest["name"])
            bucket = dest_agg.setdefault(
                dk,
                {
                    "id": dk,
                    "name": dest["name"],
                    "unlocode": dest.get("unlocode"),
                    "lat": dest["lat"],
                    "lng": dest["lng"],
                    "count": 0,
                    "kind": "destination",
                },
            )
            bucket["count"] += 1

        if origin and dest:
            rk = f"{origin['lat']:.3f}:{origin['lng']:.3f}->{dest['lat']:.3f}:{dest['lng']:.3f}"
            route = route_agg.setdefault(
                rk,
                {
                    "id": rk,
                    "origin_name": origin["name"],
                    "destination_name": dest["name"],
                    "origin_lat": origin["lat"],
                    "origin_lng": origin["lng"],
                    "destination_lat": dest["lat"],
                    "destination_lng": dest["lng"],
                    "count": 0,
                },
            )
            route["count"] += 1

    origins = sorted(origin_agg.values(), key=lambda p: (-p["count"], p["name"]))
    destinations = sorted(dest_agg.values(), key=lambda p: (-p["count"], p["name"]))
    routes = sorted(route_agg.values(), key=lambda r: (-r["count"], r["origin_name"]))

    return {
        "summary": {
            "trips": total,
            "resolved_trips": total - unresolved,
            "unresolved_trips": unresolved,
            "origin_ports": len(origins),
            "destination_ports": len(destinations),
            "routes": len(routes),
        },
        "origins": origins,
        "destinations": destinations,
        "routes": routes,
    }
