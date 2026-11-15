"""
LUNAR EDGE — JPL Horizons Validation Service

Queries the official NASA/JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api)
for independent validation of lunar surface topocentric ephemerides.

Reference:
  - JPL Horizons Web API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
  - Observer Center: 'coord@301' (Moon surface)
  - Coordinate Type: 'GEODETIC' (East-positive longitude, latitude, altitude in km)
  - Reference Frame: MOON_ME (IAU Mean Earth/Polar Axis)
"""

import re
import logging
from typing import Optional
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Astronomical Unit in kilometres (IAU 2012 standard)
AU_TO_KM = 149_597_870.7


class HorizonsService:
    """
    Client for JPL Horizons API to query reference topocentric positions
    as seen from a user-specified coordinate on the lunar surface.
    """

    def __init__(self, timeout_s: float = 30.0):
        self.timeout_s = timeout_s

    def query_observer_ephemeris(
        self,
        target: str,
        lon_deg: float,
        lat_deg: float,
        elevation_km: float,
        start_utc: str,
        stop_utc: str,
        step_str: str = "1 h",
    ) -> list[dict]:
        """
        Query Horizons for apparent Azimuth, Elevation, Angular Diameter, and Range.

        Parameters:
          target: 'SUN' (ID: '10') or 'EARTH' (ID: '399')
          lon_deg: Selenographic East longitude (-180 to +180 or 0 to 360)
          lat_deg: Selenographic latitude (-90 to +90, South negative)
          elevation_km: Elevation above lunar reference sphere in km
          start_utc: Start timestamp in UTC (e.g. '2026-01-15 12:00' or ISO)
          stop_utc: Stop timestamp in UTC
          step_str: Time step string recognized by Horizons (e.g. '1 h', '15 m')
        """
        target_upper = target.upper()
        if target_upper in ("SUN", "10"):
            command_id = "10"
        elif target_upper in ("EARTH", "399"):
            command_id = "399"
        else:
            command_id = target

        start_clean = start_utc.replace("T", " ").replace("Z", "")[:16]
        stop_clean = stop_utc.replace("T", " ").replace("Z", "")[:16]

        site_coord = f"{lon_deg:.6f},{lat_deg:.6f},{elevation_km:.4f}"

        params = {
            "format": "json",
            "COMMAND": f"'{command_id}'",
            "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'OBSERVER'",
            "CENTER": "'coord@301'",
            "COORD_TYPE": "'GEODETIC'",
            "SITE_COORD": f"'{site_coord}'",
            "START_TIME": f"'{start_clean}'",
            "STOP_TIME": f"'{stop_clean}'",
            "STEP_SIZE": f"'{step_str}'",
            "QUANTITIES": "'4,13,20'",  # 4=Az/El, 13=AngDiam, 20=Range
            "OBJ_DATA": "'NO'",
            "ANG_FORMAT": "'DEG'",
        }

        try:
            with httpx.Client(timeout=self.timeout_s) as client:
                resp = client.get(HORIZONS_API_URL, params=params)
                resp.raise_for_status()
                data = resp.json()

            result_text = data.get("result", "")
            return self._parse_ephemeris_table(result_text)

        except Exception as e:
            logger.error(f"Horizons API query failed: {e}")
            raise RuntimeError(f"Horizons API query failed: {e}") from e

    def _parse_ephemeris_table(self, result_text: str) -> list[dict]:
        """
        Parse the table text between $$SOE and $$EOE markers.
        Robustly accounts for optional Horizons solar presence flags (e.g., '*', 'm', 'A', 'N').
        """
        match = re.search(r"\$\$SOE\s*(.*?)\s*\$\$EOE", result_text, re.DOTALL)
        if not match:
            if "No ephemeris for target" in result_text or "Cannot find" in result_text:
                raise ValueError(f"Horizons reported error: {result_text[:400]}")
            raise ValueError(f"No ephemeris table markers ($$SOE/$$EOE) found in Horizons response:\n{result_text[:500]}")

        lines = match.group(1).strip().splitlines()
        rows = []

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            tokens = line_str.split()
            if len(tokens) < 5:
                continue

            time_str = f"{tokens[0]} {tokens[1]}"

            # Horizons inserts single-character solar flags (e.g. '*' for daylight, 'm' for moonlight)
            # between time and azimuth:
            # Case 1 (no flag): [Date, Time, Azimuth, Elevation, AngDiam, Delta, DelDot]
            # Case 2 (with flag): [Date, Time, '*', Azimuth, Elevation, AngDiam, Delta, DelDot]
            idx = 2
            # If token at idx is non-numeric, it is an illumination flag; skip it
            try:
                float(tokens[idx])
            except ValueError:
                idx += 1

            try:
                az_deg = float(tokens[idx])
                el_deg = float(tokens[idx + 1])
                ang_diam_arcsec = float(tokens[idx + 2])
                range_au = float(tokens[idx + 3])

                ang_diam_deg = ang_diam_arcsec / 3600.0
                range_km = range_au * AU_TO_KM

                rows.append({
                    "time_str": time_str,
                    "azimuth_deg": az_deg,
                    "elevation_deg": el_deg,
                    "angular_diameter_deg": ang_diam_deg,
                    "angular_radius_deg": ang_diam_deg / 2.0,
                    "range_km": range_km,
                })
            except (ValueError, IndexError) as e:
                logger.warning(f"Could not parse Horizons row: '{line_str}' -> {e}")
                continue

        return rows


# Global singleton instance
horizons_service = HorizonsService()
