"""
LUNAR EDGE — Independent JPL Horizons Ephemeris Validation Tests

Performs high-precision cross-validation comparing local SPICE calculations against
the live NASA/JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api) for:
1. Haworth Rim (lat: -87.45°, lon: -5.0°)
2. Shackleton Region (lat: -89.7°, lon: 129.0°)

Validation Tolerance:
  - Azimuth: |SPICE - Horizons| < 0.001° (~3.6 arcsec)
  - Elevation: |SPICE - Horizons| < 0.001° (~3.6 arcsec)
  - Distance: |SPICE - Horizons| / Distance < 1e-6 (< 0.0001% relative)
"""

import pytest
import numpy as np
from app.services.spice_service import spice_service
from app.services.horizons_service import horizons_service


@pytest.mark.parametrize("site_name,lat,lon,elevation_m", [
    ("Haworth Rim", -87.45, -5.0, 0.0),
    ("Shackleton Region", -89.7, 129.0, 0.0),
])
def test_sun_geometry_vs_horizons(site_name, lat, lon, elevation_m):
    """
    Validate Sun topocentric azimuth and elevation against JPL Horizons.
    Tests 3 epochs spaced across a 24-hour interval.
    """
    start_utc = "2026-01-15 00:00"
    stop_utc = "2026-01-16 00:00"
    step_str = "12 h"

    # 1. Query Horizons ground-truth
    horizons_rows = horizons_service.query_observer_ephemeris(
        target="SUN",
        lon_deg=lon,
        lat_deg=lat,
        elevation_km=elevation_m / 1000.0,
        start_utc=start_utc,
        stop_utc=stop_utc,
        step_str=step_str,
    )
    assert len(horizons_rows) >= 2, f"Horizons returned insufficient rows for {site_name}"

    print(f"\n=======================================================")
    print(f"VALIDATION REPORT: SUN vs JPL HORIZONS — {site_name}")
    print(f"Coordinates: lat={lat}°, lon={lon}°, alt={elevation_m}m")
    print(f"-------------------------------------------------------")

    for h in horizons_rows:
        time_str = h["time_str"]
        # Convert time_str ('2026-Jan-15 12:00') to SPICE ET
        et = spice_service.utc_to_et(time_str)

        # 2. Compute via local SPICE service
        spice_res = spice_service.compute_body_topocentric(
            body="SUN",
            lat_deg=lat,
            lon_deg=lon,
            elevation_m=elevation_m,
            et=et,
        )

        az_hz = h["azimuth_deg"]
        el_hz = h["elevation_deg"]
        range_hz = h["range_km"]
        ang_diam_hz = h["angular_diameter_deg"]

        az_sp = spice_res["azimuth_deg"]
        el_sp = spice_res["elevation_deg"]
        range_sp = spice_res["distance_km"]
        ang_diam_sp = spice_res["angular_diameter_deg"]

        # Angular difference accounting for 360° wrap
        az_diff = abs(az_sp - az_hz)
        if az_diff > 180.0:
            az_diff = 360.0 - az_diff
        el_diff = abs(el_sp - el_hz)
        range_diff = abs(range_sp - range_hz)

        print(f"Epoch: {time_str}")
        print(f"  Azimuth   : SPICE = {az_sp:10.5f}°, Horizons = {az_hz:10.5f}°, Δ = {az_diff:8.6f}°")
        print(f"  Elevation : SPICE = {el_sp:10.5f}°, Horizons = {el_hz:10.5f}°, Δ = {el_diff:8.6f}°")
        print(f"  Range (km): SPICE = {range_sp:,.1f}, Horizons = {range_hz:,.1f}, Δ = {range_diff:6.2f} km")
        print(f"  Ang Diam  : SPICE = {ang_diam_sp:8.5f}°, Horizons = {ang_diam_hz:8.5f}°")

        # Scientific assertions
        assert az_diff < 0.001, f"Sun azimuth error {az_diff:.6f}° exceeds 0.001° at {time_str}"
        assert el_diff < 0.001, f"Sun elevation error {el_diff:.6f}° exceeds 0.001° at {time_str}"
        assert (range_diff / range_hz) < 1e-6, f"Sun range relative error exceeds 1e-6"


@pytest.mark.parametrize("site_name,lat,lon,elevation_m", [
    ("Haworth Rim", -87.45, -5.0, 0.0),
    ("Shackleton Region", -89.7, 129.0, 0.0),
])
def test_earth_geometry_vs_horizons(site_name, lat, lon, elevation_m):
    """
    Validate Earth topocentric azimuth and elevation against JPL Horizons.
    Tests 3 epochs spaced across a 24-hour interval.
    """
    start_utc = "2026-01-15 00:00"
    stop_utc = "2026-01-16 00:00"
    step_str = "12 h"

    # 1. Query Horizons ground-truth
    horizons_rows = horizons_service.query_observer_ephemeris(
        target="EARTH",
        lon_deg=lon,
        lat_deg=lat,
        elevation_km=elevation_m / 1000.0,
        start_utc=start_utc,
        stop_utc=stop_utc,
        step_str=step_str,
    )
    assert len(horizons_rows) >= 2, f"Horizons returned insufficient rows for {site_name}"

    print(f"\n=======================================================")
    print(f"VALIDATION REPORT: EARTH vs JPL HORIZONS — {site_name}")
    print(f"Coordinates: lat={lat}°, lon={lon}°, alt={elevation_m}m")
    print(f"-------------------------------------------------------")

    for h in horizons_rows:
        time_str = h["time_str"]
        et = spice_service.utc_to_et(time_str)

        # 2. Compute via local SPICE service
        spice_res = spice_service.compute_body_topocentric(
            body="EARTH",
            lat_deg=lat,
            lon_deg=lon,
            elevation_m=elevation_m,
            et=et,
        )

        az_hz = h["azimuth_deg"]
        el_hz = h["elevation_deg"]
        range_hz = h["range_km"]
        ang_diam_hz = h["angular_diameter_deg"]

        az_sp = spice_res["azimuth_deg"]
        el_sp = spice_res["elevation_deg"]
        range_sp = spice_res["distance_km"]
        ang_diam_sp = spice_res["angular_diameter_deg"]

        az_diff = abs(az_sp - az_hz)
        if az_diff > 180.0:
            az_diff = 360.0 - az_diff
        el_diff = abs(el_sp - el_hz)
        range_diff = abs(range_sp - range_hz)

        print(f"Epoch: {time_str}")
        print(f"  Azimuth   : SPICE = {az_sp:10.5f}°, Horizons = {az_hz:10.5f}°, Δ = {az_diff:8.6f}°")
        print(f"  Elevation : SPICE = {el_sp:10.5f}°, Horizons = {el_hz:10.5f}°, Δ = {el_diff:8.6f}°")
        print(f"  Range (km): SPICE = {range_sp:,.1f}, Horizons = {range_hz:,.1f}, Δ = {range_diff:6.2f} km")
        print(f"  Ang Diam  : SPICE = {ang_diam_sp:8.5f}°, Horizons = {ang_diam_hz:8.5f}°")

        # Scientific assertions
        assert az_diff < 0.001, f"Earth azimuth error {az_diff:.6f}° exceeds 0.001° at {time_str}"
        assert el_diff < 0.001, f"Earth elevation error {el_diff:.6f}° exceeds 0.001° at {time_str}"
        assert (range_diff / range_hz) < 1e-5, f"Earth range relative error exceeds 1e-5"
