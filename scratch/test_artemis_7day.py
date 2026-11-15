import urllib.request
import json
from datetime import datetime, timedelta

base_date = datetime(2026, 11, 15)
test_offsets = [0, 4, 8, 12, 16, 20, 24]

print(f"{'Date':<12} | {'Viable':<7} | {'Conditional':<11} | {'Infeasible':<10} | {'Top Recommended Site'}")
print("-" * 75)

for offset in test_offsets:
    test_dt = base_date + timedelta(days=offset)
    req_data = {
        "mission_name": "Artemis III 7-Day EVA Demo",
        "target_region": "south_pole_all",
        "start_utc": test_dt.strftime("%Y-%m-%dT00:00:00"),
        "duration_days": 7.0,  # Realistic 7-day Artemis surface stay
        "step_minutes": 60.0,
        "requirements": {
            "min_continuous_sunlight_hours": 48.0,
            "max_tolerable_dark_hours": 24.0,
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
    top_c = data["candidates"][0] if data["candidates"] else None
    top_desc = f"{top_c['name']} (Score: {top_c['composite_score']}, {top_c['classification']})" if top_c else "None"
    print(f"{test_dt.strftime('%Y-%m-%d'):<12} | {data['viable_count']:<7} | {data['conditional_count']:<11} | {data['infeasible_count']:<10} | {top_desc}")
