import urllib.request
import json

# Fetch sites first
sites_resp = urllib.request.urlopen("http://127.0.0.1:8000/api/sites")
sites = json.loads(sites_resp.read().decode())

print(f"{'Site Name':<30} | {'Sun %':<7} | {'Sun (h)':<9} | {'Max Light':<11} | {'Max Dark':<10} | {'Earth %':<8} | {'Max Earth Comms'}")
print("-" * 105)

for key, site in sites.items():
    req_body = {
        "site": site,
        "start_utc": "2026-11-15T00:00:00Z",
        "duration_days": 14.0,
        "step_minutes": 60.0,
        "horizon_radius_km": 20.0
    }
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/visibility/evaluate",
        data=json.dumps(req_body).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read().decode())
        summary = data.get("summary", {})
        sun_pct = summary.get("sunlit_fraction", 0) * 100
        sun_h = summary.get("sunlit_hours", 0)
        max_sun = summary.get("longest_sunlit_window_hours", 0)
        max_dark = summary.get("longest_dark_period_hours", 0)
        earth_pct = summary.get("earth_visible_fraction", 0) * 100
        max_comms = summary.get("longest_earth_visible_window_hours", 0)
        print(f"{site['name'][:30]:<30} | {sun_pct:>5.1f}% | {sun_h:>7.1f} h | {max_sun:>9.1f} h | {max_dark:>8.1f} h | {earth_pct:>6.1f}% | {max_comms:>13.1f} h")
    except Exception as e:
        print(f"{site['name'][:30]:<30} | ERROR: {e}")
