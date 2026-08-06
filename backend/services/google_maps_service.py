import logging
import math
from typing import Any, Dict, Optional

import requests

from backend.config import GOOGLE_MAPS_API_KEY

logger = logging.getLogger(__name__)


class GoogleMapsService:
    """Google Maps / Places API integration."""

    def __init__(self):
        self.api_key = GOOGLE_MAPS_API_KEY
        self.places_base_url = "https://maps.googleapis.com/maps/api/place"
        self.geocoding_base_url = "https://maps.googleapis.com/maps/api/geocode"
        self.distance_matrix_base_url = "https://maps.googleapis.com/maps/api/distancematrix/json"

        if not self.api_key:
            logger.warning("GOOGLE_MAPS_API_KEY not configured")

    def _make_request(self, url: str, params: Dict[str, Any], ok_statuses: tuple = ("OK",)) -> Optional[Dict[str, Any]]:
        try:
            params = {**params, "key": self.api_key}
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            status = data.get("status")
            if status not in ok_statuses:
                logger.error(
                    "Google Maps API error: %s - %s",
                    status,
                    data.get("error_message", "Unknown error"),
                )
                return None

            return data
        except requests.exceptions.RequestException as e:
            logger.error("Request error: %s", e)
            return None
        except Exception as e:
            logger.error("Unexpected error: %s", e)
            return None

    def search_places_autocomplete(
        self,
        input_text: str,
        session_token: str | None = None,
        country: str | None = None,
    ) -> Optional[Dict[str, Any]]:
        if not self.api_key:
            return None

        url = f"{self.places_base_url}/autocomplete/json"
        params: Dict[str, Any] = {
            "input": input_text,
            "types": "geocode",
            "language": "en",
        }
        if country:
            params["components"] = f"country:{country.lower()}"
        if session_token:
            params["sessiontoken"] = session_token

        return self._make_request(url, params, ok_statuses=("OK", "ZERO_RESULTS"))

    def get_place_details(
        self,
        place_id: str,
        fields: str = "formatted_address,geometry,address_components",
    ) -> Optional[Dict[str, Any]]:
        if not self.api_key:
            return None

        url = f"{self.places_base_url}/details/json"
        params = {
            "place_id": place_id,
            "fields": fields,
            "language": "en",
        }
        return self._make_request(url, params)

    def geocode_address(self, address: str, country: str | None = None) -> Optional[Dict[str, Any]]:
        if not self.api_key:
            return None

        url = f"{self.geocoding_base_url}/json"
        params: Dict[str, Any] = {
            "address": address,
            "language": "en",
        }
        if country:
            params["components"] = f"country:{country.lower()}"
        return self._make_request(url, params, ok_statuses=("OK", "ZERO_RESULTS"))

    def reverse_geocode(self, lat: float, lng: float) -> Optional[Dict[str, Any]]:
        if not self.api_key:
            return None

        url = f"{self.geocoding_base_url}/json"
        params = {
            "latlng": f"{lat},{lng}",
            "language": "en",
        }
        return self._make_request(url, params, ok_statuses=("OK", "ZERO_RESULTS"))

    def calculate_distance_matrix(self, from_coords: Dict[str, float], to_coords: Dict[str, float]) -> Optional[Dict[str, Any]]:
        if not from_coords or not to_coords or not self.api_key:
            return None

        result = self._make_request(
            self.distance_matrix_base_url,
            {
                "origins": f"{from_coords['lat']},{from_coords['lng']}",
                "destinations": f"{to_coords['lat']},{to_coords['lng']}",
                "mode": "driving",
                "units": "metric",
                "language": "en",
            },
        )

        if not result:
            return None

        element = result.get("rows", [{}])[0].get("elements", [{}])[0]
        if element.get("status") != "OK":
            logger.error("Distance Matrix API element status: %s", element.get("status"))
            return None

        distance = element.get("distance", {})
        duration = element.get("duration", {})
        duration_in_traffic = element.get("duration_in_traffic", {})

        return {
            "distance_km": round(distance.get("value", 0) / 1000, 2),
            "distance_miles": round(distance.get("value", 0) * 0.000621371, 2),
            "distance_text": distance.get("text", ""),
            "duration_minutes": round(duration.get("value", 0) / 60, 1),
            "duration_hours": round(duration.get("value", 0) / 3600, 2),
            "duration_text": duration.get("text", ""),
            "duration_in_traffic_minutes": round(duration_in_traffic.get("value", 0) / 60, 1) if duration_in_traffic else None,
            "duration_in_traffic_text": duration_in_traffic.get("text", "") if duration_in_traffic else "",
            "from_coordinates": from_coords,
            "to_coordinates": to_coords,
            "route_type": "road",
            "api_used": "distance_matrix",
        }

    @staticmethod
    def haversine_distance(from_coords: Dict[str, float], to_coords: Dict[str, float]) -> Dict[str, Any]:
        lat1, lon1 = math.radians(from_coords["lat"]), math.radians(from_coords["lng"])
        lat2, lon2 = math.radians(to_coords["lat"]), math.radians(to_coords["lng"])

        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        distance_km = 6371 * c

        return {
            "distance_km": round(distance_km, 2),
            "distance_miles": round(distance_km * 0.621371, 2),
            "from_coordinates": from_coords,
            "to_coordinates": to_coords,
            "route_type": "straight_line",
            "api_used": "haversine_fallback",
        }


google_maps_service = GoogleMapsService()
