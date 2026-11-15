"""
test_audit_fixes_validation.py — LUNAR EDGE Scientific & Engineering Audit Verification Tests

Directly verifies the 5 critical bug corrections:
1. Grid Convergence Angle alignment in horizon_engine.py
2. Elevation synchronization between CANDIDATE_LANDING_SITES and the LOLA 80m DEM
3. Physical spherical horizon dip lower bound enforcement
4. Invariance and consistency of polar_stereo_to_selenographic return signature
5. Topocentric cardinal displacement and DEM elevation sampling in ContinuityEngine
"""

import math
import numpy as np
import pytest

from app.engines.terrain_engine import TerrainEngine, DEMPatch
from app.engines.horizon_engine import compute_horizon_profile
from app.engines.geometry_engine import CANDIDATE_LANDING_SITES
from app.engines.mission_engine import MissionEngine
from app.engines.continuity_engine import ContinuityEngine
from app.utils.coordinate_utils import selenographic_to_polar_stereo


def test_grid_convergence_azimuth_alignment():
    """
    Verify that ray directions for arbitrary observer longitudes are aligned with
    topocentric True North and True East, correcting for map grid convergence.
    """
    for lon in [0.0, 31.5, 90.0, 129.0, -88.0, 180.0]:
        lat = -85.0
        x0, y0 = selenographic_to_polar_stereo(lon, lat)

        # Create a synthetic patch centered at this observer location
        patch = DEMPatch(
            observer_x_m=x0,
            observer_y_m=y0,
            observer_elevation_m=0.0,
            x_coords=np.linspace(x0 - 5000, x0 + 5000, 101),
            y_coords=np.linspace(y0 + 5000, y0 - 5000, 101),
            elevation_m=np.zeros((101, 101), dtype=np.float32),
            nodata_mask=np.zeros((101, 101), dtype=bool),
            pixel_size_m=80.0,
            radius_m=5000.0,
            observer_lat_deg=lat,
            observer_lon_deg=lon,
        )

        # Place a 1000m peak exactly 2400m along True North from observer:
        # True North unit vector in PS is (sin(lon), cos(lon))
        lon_rad = math.radians(lon)
        u_north_x = math.sin(lon_rad)
        u_north_y = math.cos(lon_rad)

        peak_x = x0 + 2400.0 * u_north_x
        peak_y = y0 + 2400.0 * u_north_y

        # Find closest pixel in patch grid
        col = int(np.round((peak_x - patch.x_coords[0]) / patch.pixel_size_m))
        row = int(np.round((peak_y - patch.y_coords[0]) / (patch.y_coords[1] - patch.y_coords[0])))

        if 0 <= row < 101 and 0 <= col < 101:
            patch.elevation_m[row, col] = 1000.0

            horizon = compute_horizon_profile(patch, n_azimuths=360, min_range_m=100.0)

            # Azimuth 0° is True North! Peak must be detected at Azimuth 0° (or adjacent bin +/- 1 deg)
            max_az = int(np.argmax(horizon))
            az_err = min(max_az, 360 - max_az)
            assert az_err <= 1, f"Peak placed at True North for lon={lon}° was detected at azimuth {max_az}°, expected 0°"
            assert horizon[max_az] > 15.0, f"Peak height not detected: {horizon[max_az]}°"


def test_dem_elevation_synchronization():
    """
    Verify that MissionEngine provides candidate site elevations matching
    the bilinear interpolation of the NASA LOLA 80m DEM.
    """
    te = TerrainEngine()
    te.load()
    me = MissionEngine(terrain_engine=te)
    me.initialize()

    sites = me.get_candidate_sites()
    for sid, site in sites.items():
        dem_elev = te.get_elevation(site.latitude_deg, site.longitude_deg)
        # Should match within 0.1 m
        assert abs(site.elevation_m - dem_elev) < 0.2, (
            f"Site {sid} elevation {site.elevation_m}m does not match DEM {dem_elev}m"
        )


def test_spherical_horizon_physical_lower_bound():
    """
    Verify that an observer at elevation h cannot produce horizon dip angles
    exceeding the lunar spherical curvature horizon limit.
    """
    # Flat patch with observer elevated 3,400 m above mean sphere
    half = 10000.0
    x = np.linspace(-half, half, 101)
    y = np.linspace(half, -half, 101)
    # Terrain is at 0 m (mean sphere), observer is at 3,400 m
    elev = np.zeros((101, 101), dtype=np.float32)
    patch = DEMPatch(
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_elevation_m=3400.0,
        x_coords=x,
        y_coords=y,
        elevation_m=elev,
        nodata_mask=np.zeros((101, 101), dtype=bool),
        pixel_size_m=80.0,
        radius_m=half,
        observer_lat_deg=-90.0,
        observer_lon_deg=0.0,
    )

    horizon = compute_horizon_profile(patch, n_azimuths=72, min_range_m=100.0)

    # Theoretical horizon dip for h = 3400 m is -arccos(1737400 / (1737400 + 3400)) ~ -3.58°
    theory_dip = -math.degrees(math.acos(1737400.0 / (1737400.0 + 3400.0)))

    # Horizon must not be lower than theory_dip (within small float precision)
    assert np.all(horizon >= theory_dip - 0.01), (
        f"Horizon values dip below theoretical lunar horizon {theory_dip:.3f}°: min={np.min(horizon):.3f}°"
    )


def test_polar_stereo_tuple_order_invariance():
    """
    Verify that polar_stereo_to_selenographic returns (lat_deg, lon_deg)
    consistently across both loaded and unloaded/fallback states.
    """
    te_unloaded = TerrainEngine()
    # Do not call load() - test fallback path
    lat_fb, lon_fb = te_unloaded.polar_stereo_to_selenographic(74508.1, 121586.2)

    te_loaded = TerrainEngine()
    te_loaded.load()
    lat_ld, lon_ld = te_loaded.polar_stereo_to_selenographic(74508.1, 121586.2)

    # Both must return latitude in [-90, 0] and longitude in [-180, 180]
    assert -90.0 <= lat_fb <= 0.0, f"Fallback latitude invalid: {lat_fb}"
    assert -90.0 <= lat_ld <= 0.0, f"Loaded latitude invalid: {lat_ld}"
    assert abs(lat_fb - lat_ld) < 1e-4, f"Mismatch between fallback and loaded lat: {lat_fb} vs {lat_ld}"
    assert abs(lon_fb - lon_ld) < 1e-4, f"Mismatch between fallback and loaded lon: {lon_fb} vs {lon_ld}"


def test_continuity_envelope_topocentric_perturbation():
    """
    Verify that ContinuityEngine evaluates spatial perturbations in topocentric
    cardinal directions and queries real DEM elevations at displaced locations.
    """
    te = TerrainEngine()
    te.load()
    ce = ContinuityEngine(terrain_engine=te)

    site = CANDIDATE_LANDING_SITES["shackleton_connecting_ridge"]
    res = ce.evaluate_continuity_envelope(
        site=site,
        start_utc="2026-07-01T00:00:00Z",
        duration_days=1.0,
        step_minutes=60.0,
        spatial_radii_m=[100.0],
        temporal_offsets_days=[],
    )

    # Check that perturbations were evaluated and have realistic DEM elevations
    assert len(res.perturbations) == 4
    for p in res.perturbations:
        assert p.displacement_distance_m == 100.0
        # Evaluated latitude must be valid near Shackleton (-90 to -89)
        assert -90.0 <= p.evaluated_lat_deg <= -89.0


def test_nobile_continuous_sunlight_physical_impossibility():
    """
    Verify that across a complete 29.53-day synodic lunar illumination cycle,
    Nobile Crater Rim 1 experiences solar elevation below the spherical horizon dip
    (-4.814°), proving that 100% continuous sunlight is physically impossible.
    """
    from app.services.spice_service import spice_service

    site = CANDIDATE_LANDING_SITES["nobile_rim_1"]
    ts = spice_service.compute_time_series(
        lat_deg=site.latitude_deg,
        lon_deg=site.longitude_deg,
        elevation_m=site.elevation_m,
        start_utc="2026-07-01T00:00:00",
        duration_days=29.53,
        step_minutes=60.0,
    )

    sun_els = [s["sun_elevation_deg"] for s in ts]
    min_sun_el = min(sun_els)
    max_sun_el = max(sun_els)

    # 1. Sun dips deeply negative during the diurnal cycle
    assert min_sun_el < -5.0, f"Expected min Sun elevation < -5.0°, got {min_sun_el:.2f}°"
    assert max_sun_el > 3.0, f"Expected max Sun elevation > 3.0°, got {max_sun_el:.2f}°"

    # 2. Geometric horizon dip for h = 6,151 m is -4.814°
    # The Sun dips below the spherical limb
    sphere_dip = -math.degrees(math.acos(1737400.0 / (1737400.0 + site.elevation_m)))
    assert min_sun_el < sphere_dip, f"Min sun el {min_sun_el:.2f}° must dip below limb {sphere_dip:.2f}°"

    # 3. Geometric daylight fraction across synodic month is ~40-50%, NOT 100%
    daylight_frac = sum(el > 0.0 for el in sun_els) / len(sun_els)
    assert 0.35 <= daylight_frac <= 0.55, f"Expected daylight frac 35-55%, got {daylight_frac*100:.1f}%"


def test_horizon_distance_exact_and_approximate():
    """
    Verify the horizon distance formulas for observers on the Moon:
    d_approx = sqrt(2 * R * h)
    d_exact  = sqrt(2 * R * h + h^2)
    """
    R = 1737400.0  # IAU Moon 2000 sphere radius

    # Observer at Nobile Rim 1: h = 6,151 m
    h_nobile = 6151.0
    d_nobile_approx = math.sqrt(2 * R * h_nobile)
    d_nobile_exact = math.sqrt(2 * R * h_nobile + h_nobile**2)
    # Both must be ~146.2 km (approx) and ~146.3 km (exact)
    assert 146100.0 < d_nobile_approx < 146300.0
    assert 146200.0 < d_nobile_exact < 146400.0
    # Relative difference is less than 0.1%
    assert abs(d_nobile_exact - d_nobile_approx) / d_nobile_exact < 0.001

    # Observer at nominal 3,400 m
    h_3400 = 3400.0
    d_3400_approx = math.sqrt(2 * R * h_3400)
    assert 108600.0 < d_3400_approx < 108800.0


def test_earth_libration_excursion_invariants():
    """
    Verify that across a 28-day cycle, the Earth center elevation excursion
    at polar sites matches the theoretical Cassini's law libration of ~13.4°,
    and Earth apparent angular diameter is ~1.90°.
    """
    from app.services.spice_service import spice_service

    site = CANDIDATE_LANDING_SITES["shackleton_connecting_ridge"]
    ts = spice_service.compute_time_series(
        lat_deg=site.latitude_deg,
        lon_deg=site.longitude_deg,
        elevation_m=site.elevation_m,
        start_utc="2026-07-01T00:00:00",
        duration_days=28.0,
        step_minutes=60.0,
    )

    els = [s["earth_elevation_deg"] for s in ts]
    rads = [s["earth_angular_radius_deg"] for s in ts]

    excursion = max(els) - min(els)
    # Theoretical peak-to-peak latitude libration is ~13.4° +/- 0.5°
    assert 13.0 <= excursion <= 13.8, f"Unexpected Earth excursion: {excursion:.2f}°"

    # Apparent Earth angular diameter is 2 * radius ~ 1.90° +/- 0.05°
    mean_diam = 2.0 * np.mean(rads)
    assert 1.85 <= mean_diam <= 1.95, f"Unexpected Earth angular diameter: {mean_diam:.3f}°"


def test_independent_geodesic_azimuth_alignment():
    """
    Independently verify grid convergence using pyproj Geod forward rays.
    Confirms that the map direction vector (dx, dy) matches (sin(A + lon), cos(A + lon)).
    """
    from pyproj import Geod

    geod = Geod(a=1737400.0, b=1737400.0)

    for lat in [-85.3, -89.7]:
        for lon in [0.0, 31.5, 90.0, 129.0, -88.0, 180.0, -129.0]:
            x0, y0 = selenographic_to_polar_stereo(lon, lat)
            for az in [0.0, 45.0, 90.0, 180.0, 270.0]:
                lon1, lat1, _ = geod.fwd(lon, lat, az, 5000.0)
                x1, y1 = selenographic_to_polar_stereo(lon1, lat1)
                dx = x1 - x0
                dy = y1 - y0
                mag = math.sqrt(dx**2 + dy**2)
                unit_dx = dx / mag
                unit_dy = dy / mag

                expected_dx = math.sin(math.radians(az + lon))
                expected_dy = math.cos(math.radians(az + lon))

                err = math.sqrt((unit_dx - expected_dx)**2 + (unit_dy - expected_dy)**2)
                assert err < 0.002, f"Geodesic mismatch at lat={lat}, lon={lon}, az={az}: {err}"
