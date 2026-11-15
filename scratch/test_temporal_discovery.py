import urllib.request
import json
from datetime import datetime, timedelta

base_date = datetime(2026, 11, 15)
test_offsets = [0, 7, 14, 21]

for offset in test_offsets:
    test_dt = base_date + timedelta(days=offset)
    req_data = {
        "mission_name": "Artemis Surface Demo",
        "target_region": "south_pole_all",
        "start_utc": test_dt.strftime("%Y-%m-%dT00:00:00"),
        "duration_days": 14.0,
        "step_minutes": 60.0,
        "requirements": {
            "min_continuous_sunlight_hours": 72.0,
            "max_tolerable_dark_hours": 48.0,
            "min_continuous_earth_comms_hours": 24.0,
            "min_simultaneous_operating_hours": 24.0,
        },
        "max_slope_deg": 12.0
    }

    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/discovery/search",
        data=json.dumps(req_data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )

    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode())
    print(f"\n=== Date: {test_dt.strftime('%Y-%m-%d')} ===")
    print(f"Total: {data['total_evaluated']} | Viable: {data['viable_count']} | Conditional: {data['conditional_count']} | Infeasible: {data['infeasible_count']}")
    for c in data["candidates"]:
        if c["classification"] in ["Screening-viable", "Conditional"]:
            print(f"  * {c['name']} ({c['key']}): {c['classification']} (Score: {c['composite_score']}, Sun: {c['sunlight_percentage']}%, Dark: {c['longest_dark_period_hours']}h, Comms: {c['longest_comms_window_hours']}h, Slope: {c['slope_deg']}°)")
