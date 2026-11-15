import httpx
import re

url = "https://ssd.jpl.nasa.gov/api/horizons.api"
params = {
    "format": "json",
    "COMMAND": "'399'",  # 399 = Earth
    "MAKE_EPHEM": "'YES'",
    "EPHEM_TYPE": "'OBSERVER'",
    "CENTER": "'coord@301'",  # 301 = Moon
    "COORD_TYPE": "'GEODETIC'",
    "SITE_COORD": "'-5.0,-87.45,0'",  # Haworth: East Lon = -5.0, Lat = -87.45, Alt = 0 km
    "START_TIME": "'2026-01-15 12:00'",
    "STOP_TIME": "'2026-01-15 13:00'",
    "STEP_SIZE": "'1 h'",
    "QUANTITIES": "'4,13,20'",  # 4 = Az/El, 13 = Ang diam, 20 = Range & range-rate
    "OBJ_DATA": "'NO'",
    "ANG_FORMAT": "'DEG'"
}

with httpx.Client(timeout=30.0) as client:
    resp = client.get(url, params=params)
    data = resp.json()
    result_text = data.get("result", "")
    match = re.search(r'\$\$SOE\s*(.*?)\s*\$\$EOE', result_text, re.DOTALL)
    if match:
        print("HORIZONS EARTH EPHEMERIS:")
        for line in match.group(1).strip().splitlines():
            print(" ", line)
