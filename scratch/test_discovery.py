import urllib.request
import json

req_data = {
    "mission_name": "Artemis Surface Demo",
    "target_region": "south_pole_all",
    "start_utc": "2026-11-15T00:00:00",
    "duration_days": 14.0,
    "step_minutes": 60.0,
    "requirements": {
        "min_sunlight_pct": 50.0,
        "max_continuous_shadow_h": 48.0,
        "min_earth_comm_pct": 40.0,
        "max_continuous_no_comm_h": 48.0,
        "max_landing_slope_deg": 10.0,
    },
    "max_slope_deg": 10.0
}

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/discovery/search",
    data=json.dumps(req_data).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode())
print("Total evaluated:", data.get("total_evaluated"))
print("Viable:", data.get("viable_count"), "Conditional:", data.get("conditional_count"), "Infeasible:", data.get("infeasible_count"))
for c in data.get("candidates", []):
    print(f" - {c['key']}: {c['name']} | classification={c['classification']} | score={c['composite_score']} | sunlight={c['sunlight_percentage']}% | comms_longest={c['longest_comms_window_hours']}h | slope={c['slope_deg']} deg")
