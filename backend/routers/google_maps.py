from fastapi import APIRouter, HTTPException, Query

from backend.services.google_maps_service import google_maps_service
from backend.utils.logger import logger

router = APIRouter()


@router.get("/places/autocomplete")
def places_autocomplete(
    input: str = Query(..., min_length=3),
    sessiontoken: str | None = Query(None),
    country: str | None = Query(None, description="Optional ISO country code to restrict results; omit for worldwide"),
):
    country_filter = country.strip().lower() if country and country.strip() else None
    result = google_maps_service.search_places_autocomplete(input, sessiontoken, country_filter)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to fetch places data")
    return result


@router.get("/places/details")
def place_details(place_id: str = Query(...)):
    result = google_maps_service.get_place_details(place_id)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to fetch place details")
    return result


@router.get("/geocode/search")
def geocode_search(
    address: str = Query(...),
    country: str | None = Query(None, description="Optional ISO country code to restrict results; omit for worldwide"),
):
    country_filter = country.strip().lower() if country and country.strip() else None
    result = google_maps_service.geocode_address(address, country_filter)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to geocode address")
    return result


@router.get("/geocode/reverse")
def reverse_geocode(
    lat: float = Query(...),
    lng: float = Query(...),
):
    result = google_maps_service.reverse_geocode(lat, lng)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to reverse geocode coordinates")
    return result


@router.get("/distance")
def calculate_distance(
    from_lat: float = Query(...),
    from_lng: float = Query(...),
    to_lat: float = Query(...),
    to_lng: float = Query(...),
):
    from_coords = {"lat": from_lat, "lng": from_lng}
    to_coords = {"lat": to_lat, "lng": to_lng}

    result = google_maps_service.calculate_distance_matrix(from_coords, to_coords)
    if result:
        return result

    logger.warning("Distance Matrix API failed, falling back to Haversine formula")
    return google_maps_service.haversine_distance(from_coords, to_coords)


@router.get("/health")
def health_check():
    api_key_configured = bool(google_maps_service.api_key)
    return {
        "status": "healthy" if api_key_configured else "unhealthy",
        "api_key_configured": api_key_configured,
        "service": "Google Maps API Service",
    }
