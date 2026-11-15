"""
LUNAR EDGE — Complete Phase 2 SPICE & Horizons Validation Runner
Runs all validation tests directly and produces formatted aerospace engineering verification tables.
"""

import sys
from pathlib import Path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

import numpy as np
from app.services.spice_service import spice_service
from app.services.horizons_service import horizons_service
from app.utils.coordinate_utils import compute_topocentric_basis

def run_spice_tests():
    print("=" * 75)
    print("TEST SUITE 1: SPICE EPHEMERIS & TOPOCENTRIC GEOMETRY")
    print("=" * 75)

    # 1. Kernel loading test
    spice_service.load_kernels()
    assert spice_service._kernels_loaded is True
    print("[PASS] Kernels successfully loaded into CSPICE pool.")

    # 2. UTC <-> ET roundtrip
    t_utc = "2026-07-20T14:30:00.000"
    et = spice_service.utc_to_et(t_utc)
    t_roundtrip = spice_service.et_to_utc(et)
    assert "2026-07-20" in t_roundtrip and "14:30:00" in t_roundtrip
    print(f"[PASS] UTC <-> ET bidirectional conversion: {t_utc} -> ET {et:.3f} -> {t_roundtrip}")

    # 3. Basis orthonormality & polar singularity tests
    test_coords = [
        ("Haworth Rim", -87.45, -5.0),
        ("Shackleton Region", -89.7, 129.0),
        ("Nobile Rim 1", -85.3, 31.5),
        ("Nobile Rim 2", -84.2, 60.7),
        ("Exact South Pole", -90.0, 0.0),
    ]

    for name, lat, lon in test_coords:
        up, north, east = compute_topocentric_basis(lat, lon)
        assert np.isclose(np.linalg.norm(up), 1.0, atol=1e-12)
        assert np.isclose(np.linalg.norm(north), 1.0, atol=1e-12)
        assert np.isclose(np.linalg.norm(east), 1.0, atol=1e-12)
        assert np.isclose(np.dot(up, north), 0.0, atol=1e-12)
        assert np.isclose(np.dot(up, east), 0.0, atol=1e-12)
        assert np.isclose(np.dot(north, east), 0.0, atol=1e-12)
        assert np.allclose(np.cross(east, north), up, atol=1e-12)
        print(f"[PASS] Orthonormal basis for {name:18s} (lat={lat:6.2f}°, lon={lon:6.2f}°): Up x North = East verified.")

    # 4. Astronomical bounds test
    et_sample = spice_service.utc_to_et("2026-01-15T12:00:00")
    geo = spice_service.compute_solar_and_earth_geometry(-87.45, -5.0, 0.0, et_sample)
    sun = geo["sun"]
    earth = geo["earth"]

    assert 0.0 <= sun["azimuth_deg"] < 360.0
    assert -90.0 <= sun["elevation_deg"] <= 90.0
    assert 1.45e8 <= sun["distance_km"] <= 1.53e8
    assert 0.25 <= sun["angular_radius_deg"] <= 0.28

    assert 0.0 <= earth["azimuth_deg"] < 360.0
    assert -90.0 <= earth["elevation_deg"] <= 90.0
    assert 3.5e5 <= earth["distance_km"] <= 4.2e5
    assert 0.85 <= earth["angular_radius_deg"] <= 1.05
    print(f"[PASS] Astronomical physical bounds satisfied for Sun and Earth.")

    # 5. Multi-day time-series continuity test
    records = spice_service.compute_time_series(
        lat_deg=-87.45,
        lon_deg=-5.0,
        elevation_m=0.0,
        start_utc="2026-01-15T00:00:00",
        duration_days=7.0,
        step_minutes=60.0,
    )
    assert len(records) == 7 * 24 + 1
    for r in records:
        assert not np.isnan(r["sun_azimuth_deg"])
        assert not np.isnan(r["sun_elevation_deg"])
        assert not np.isnan(r["earth_azimuth_deg"])
        assert not np.isnan(r["earth_elevation_deg"])
    print(f"[PASS] 7-day continuous time-series (169 samples) generated with zero NaNs.")
    return True


def run_horizons_validation():
    print("\n" + "=" * 75)
    print("TEST SUITE 2: INDEPENDENT JPL HORIZONS API CROSS-VALIDATION")
    print("=" * 75)

    sites = [
        ("Haworth Rim", -87.45, -5.0, 0.0),
        ("Shackleton Region", -89.7, 129.0, 0.0),
    ]

    targets = ["SUN", "EARTH"]

    for site_name, lat, lon, elev_m in sites:
        print(f"\n--- Site: {site_name} (Lat: {lat}°, Lon: {lon}°, Elev: {elev_m}m) ---")

        for target in targets:
            print(f"\nTarget: {target}")
            # Query Horizons across 24 hours at 12-hour intervals
            horizons_rows = horizons_service.query_observer_ephemeris(
                target=target,
                lon_deg=lon,
                lat_deg=lat,
                elevation_km=elev_m / 1000.0,
                start_utc="2026-01-15 00:00",
                stop_utc="2026-01-16 00:00",
                step_str="12 h",
            )

            print(f"{'Epoch (UTC)':18s} | {'Quantity':10s} | {'SPICE':12s} | {'Horizons':12s} | {'Difference':14s} | {'Status'}")
            print("-" * 80)

            for h in horizons_rows:
                time_str = h["time_str"]
                et = spice_service.utc_to_et(time_str)
                res = spice_service.compute_body_topocentric(target, lat, lon, elev_m, et)

                # Azimuth comparison
                az_sp = res["azimuth_deg"]
                az_hz = h["azimuth_deg"]
                d_az = abs(az_sp - az_hz)
                if d_az > 180.0: d_az = 360.0 - d_az
                az_status = "PASS" if d_az < 0.001 else "FAIL"
                print(f"{time_str:18s} | {'Azimuth':10s} | {az_sp:10.5f}° | {az_hz:10.5f}° | {d_az:12.7f}° | {az_status}")

                # Elevation comparison
                el_sp = res["elevation_deg"]
                el_hz = h["elevation_deg"]
                d_el = abs(el_sp - el_hz)
                el_status = "PASS" if d_el < 0.001 else "FAIL"
                print(f"{'':18s} | {'Elevation':10s} | {el_sp:10.5f}° | {el_hz:10.5f}° | {d_el:12.7f}° | {el_status}")

                # Distance comparison
                r_sp = res["distance_km"]
                r_hz = h["range_km"]
                d_r = abs(r_sp - r_hz)
                rel_err = d_r / r_hz
                r_status = "PASS" if rel_err < 1e-5 else "FAIL"
                print(f"{'':18s} | {'Range km':10s} | {r_sp:12,.1f} | {r_hz:12,.1f} | {d_r:10.2f} km | {r_status}")

                # Assertions
                assert d_az < 0.001, f"Azimuth difference {d_az}° exceeds 0.001°"
                assert d_el < 0.001, f"Elevation difference {d_el}° exceeds 0.001°"
                assert rel_err < 1e-5, f"Range relative error {rel_err} exceeds 1e-5"

    print("\n" + "=" * 75)
    print("ALL VALIDATION CRITERIA SATISFIED WITH 100% SUCCESS.")
    print("===========================================================================")

if __name__ == "__main__":
    run_spice_tests()
    run_horizons_validation()
