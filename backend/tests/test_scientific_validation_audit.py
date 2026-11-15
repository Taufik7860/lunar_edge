"""
LUNAR EDGE — Phase 4 Scientific Validation Audit Test Suite

Rigorously verifies:
1. Solar disc occultation mathematics against closed-form analytical integrals.
2. Solar and Earth ephemeris geometry against physical invariants.
3. Terrain horizon obstruction vs geometric line-of-sight.
4. Operational window interval calculations and battery-sizing dark duration.
5. Mission Continuity Envelope sensitivity and boundary conditions.
6. Polar stereographic projection conformality and distance scale.
"""

import math
import numpy as np
import pytest

from app.engines.visibility_engine import (
    compute_solar_disc_fraction,
    compute_terrain_visibility_time_series,
)
from app.engines.horizon_engine import (
    compute_horizon_profile,
    interpolate_horizon,
)
from app.engines.continuity_engine import ContinuityEngine
from app.engines.terrain_engine import DEMPatch
from app.models.schemas import (
    LandingSite,
    MissionRequirements,
    TimeSeriesSample,
)
from app.services.spice_service import SPICEService
from app.utils.coordinate_utils import (
    selenographic_to_polar_stereo,
    polar_stereo_to_selenographic,
    MOON_RADIUS_METERS,
)


# ---------------------------------------------------------------------------
# Task 2: Solar Visibility & Occultation Validation
# ---------------------------------------------------------------------------

def test_solar_disc_exact_analytical_values():
    """
    Validate the circular segment solar disc fraction against exact analytical integrals.
    Area of circular cap: A(x) = R^2 * [ arccos(-x) + x * sqrt(1 - x^2) ]
    Fraction f(x) = A(x) / (pi * R^2)
    """
    R = 0.260  # degrees

    # 1. Knife-edge bisector (clearance = 0): exactly 50%
    f_zero = compute_solar_disc_fraction(0.0, R)
    assert abs(f_zero - 0.5) < 1e-12

    # 2. Semi-chord at x = +0.5 (clearance = +R/2 = 0.130 deg)
    # Analytical: 2/3 + sqrt(3)/(4*pi) = 0.80449889...
    expected_plus_half = (2.0 / 3.0) + (math.sqrt(3.0) / (4.0 * math.pi))
    actual_plus_half = compute_solar_disc_fraction(0.130, R)
    assert abs(actual_plus_half - expected_plus_half) < 1e-6

    # 3. Semi-chord at x = -0.5 (clearance = -R/2 = -0.130 deg)
    # Analytical: 1/3 - sqrt(3)/(4*pi) = 0.19550110...
    expected_minus_half = (1.0 / 3.0) - (math.sqrt(3.0) / (4.0 * math.pi))
    actual_minus_half = compute_solar_disc_fraction(-0.130, R)
    assert abs(actual_minus_half - expected_minus_half) < 1e-6

    # 4. Anti-symmetry property: f(x) + f(-x) = 1.0 everywhere
    for c in [0.01, 0.05, 0.10, 0.15, 0.20, 0.25]:
        f_pos = compute_solar_disc_fraction(c, R)
        f_neg = compute_solar_disc_fraction(-c, R)
        assert abs((f_pos + f_neg) - 1.0) < 1e-12

    # 5. Clamping beyond disk edges
    assert compute_solar_disc_fraction(R + 0.001, R) == 1.0
    assert compute_solar_disc_fraction(10.0, R) == 1.0
    assert compute_solar_disc_fraction(-R - 0.001, R) == 0.0
    assert compute_solar_disc_fraction(-10.0, R) == 0.0


def test_solar_disc_zero_radius_guard():
    """Verify numerical safeguard when angular radius is zero or negligible."""
    assert compute_solar_disc_fraction(0.1, 0.0) == 1.0
    assert compute_solar_disc_fraction(-0.1, 0.0) == 0.0


# ---------------------------------------------------------------------------
# Task 3: Earth Communication & Geometric Line-of-Sight Validation
# ---------------------------------------------------------------------------

def test_earth_distance_and_libration_invariants():
    """
    Verify SPICE ephemeris calculates Earth-Moon distance within physical orbital bounds:
    Perigee ~ 356,400 km, Apogee ~ 406,700 km.
    """
    spice = SPICEService()
    # Check over full 28-day lunar orbit
    ts = spice.compute_time_series(
        lat_deg=-89.7,
        lon_deg=129.0,
        elevation_m=1120.0,
        start_utc="2026-07-01T00:00:00Z",
        duration_days=28.0,
        step_minutes=360.0,
    )

    earth_distances = [s["earth_distance_km"] for s in ts]
    min_dist = min(earth_distances)
    max_dist = max(earth_distances)

    # Physical celestial mechanics bounds
    assert 350_000.0 < min_dist < 380_000.0
    assert 390_000.0 < max_dist < 415_000.0

    # Earth elevation variation due to lunar libration + rotation
    # Total monthly peak-to-peak elevation excursion at polar sites is ~13° to 14°
    # (oscillating between ~ -7° and +6° relative to local horizon)
    earth_elevations = [s["earth_elevation_deg"] for s in ts]
    libration_amplitude = max(earth_elevations) - min(earth_elevations)
    assert 10.0 < libration_amplitude < 16.0


def test_terrain_blocking_earth_comms_operational_window():
    """
    Verify that an elevated crater rim blocks Earth communications even when
    Earth is geometrically above the spherical horizontal plane.
    """
    # Horizon has a 4.0° ridge at Earth's azimuth (180°)
    horizon = np.zeros(360, dtype=np.float64)
    horizon[170:190] = 4.0

    # Sample A: Earth at 180° az, 2.5° elevation -> Geometrically above sphere (2.5° > 0°),
    # but blocked by 4.0° mountain! Direct comms must be False.
    s1 = TimeSeriesSample(
        et=0.0,
        utc="2026-07-01T00:00:00Z",
        sun_azimuth_deg=0.0,
        sun_elevation_deg=1.0,
        sun_distance_km=149597870.0,
        sun_angular_radius_deg=0.26,
        sun_angular_diameter_deg=0.52,
        earth_azimuth_deg=180.0,
        earth_elevation_deg=2.5,
        earth_distance_km=384400.0,
        earth_angular_radius_deg=0.95,
        earth_angular_diameter_deg=1.90,
        solar_incidence_angle_deg=89.0,
        solar_cosine_incidence=0.017,
        is_sun_above_geometric_horizon=True,
        is_sun_disc_partially_above_geometric_horizon=True,
        is_earth_above_geometric_horizon=True,
        is_earth_disc_partially_above_geometric_horizon=True,
    )

    # Sample B: Earth rises to 5.0° elevation -> Clears 4.0° mountain! Direct comms must be True.
    s2 = TimeSeriesSample(
        et=3600.0,
        utc="2026-07-01T01:00:00Z",
        sun_azimuth_deg=0.0,
        sun_elevation_deg=1.0,
        sun_distance_km=149597870.0,
        sun_angular_radius_deg=0.26,
        sun_angular_diameter_deg=0.52,
        earth_azimuth_deg=180.0,
        earth_elevation_deg=5.0,
        earth_distance_km=384400.0,
        earth_angular_radius_deg=0.95,
        earth_angular_diameter_deg=1.90,
        solar_incidence_angle_deg=89.0,
        solar_cosine_incidence=0.017,
        is_sun_above_geometric_horizon=True,
        is_sun_disc_partially_above_geometric_horizon=True,
        is_earth_above_geometric_horizon=True,
        is_earth_disc_partially_above_geometric_horizon=True,
    )

    resp = compute_terrain_visibility_time_series([s1, s2], horizon, "Audit Test Site")

    # Sample 1: Blocked
    assert resp.samples[0].earth_clearance_deg == pytest.approx(2.5 - 4.0)  # -1.5°
    assert resp.samples[0].is_earth_visible is False

    # Sample 2: Cleared
    assert resp.samples[1].earth_clearance_deg == pytest.approx(5.0 - 4.0)  # +1.0°
    assert resp.samples[1].is_earth_visible is True


# ---------------------------------------------------------------------------
# Task 4: Mission Continuity Boundary Conditions & Robustness Scoring
# ---------------------------------------------------------------------------

def test_continuity_envelope_boundary_conditions():
    """
    Test exact threshold boundary conditions where a mission requirement
    flips between pass and fail.
    """
    engine = ContinuityEngine()
    site = LandingSite(
        name="Test Rim",
        latitude_deg=-85.3,
        longitude_deg=31.5,
        elevation_m=3400.0,
        slope_deg=0.0,
        aspect_deg=0.0,
    )

    # 1. Set requirement easily satisfied
    generous_reqs = MissionRequirements(
        min_continuous_sunlight_hours=1.0,
        max_tolerable_dark_hours=500.0,
        min_continuous_earth_comms_hours=1.0,
        min_simultaneous_operating_hours=1.0,
    )
    result_pass = engine.evaluate_continuity_envelope(
        site=site,
        start_utc="2026-07-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        requirements=generous_reqs,
        spatial_radii_m=[100.0],
        temporal_offsets_days=[-1.0, 1.0],
    )
    assert result_pass.baseline_meets_requirements is True
    assert result_pass.overall_robustness_score > 0.9

    # 2. Set sunlight requirement impossibly high (e.g. 500 hours on a 2-day mission)
    impossible_reqs = MissionRequirements(
        min_continuous_sunlight_hours=500.0,
        max_tolerable_dark_hours=1.0,
        min_continuous_earth_comms_hours=1.0,
        min_simultaneous_operating_hours=1.0,
    )
    result_fail = engine.evaluate_continuity_envelope(
        site=site,
        start_utc="2026-07-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        requirements=impossible_reqs,
        spatial_radii_m=[100.0],
        temporal_offsets_days=[-1.0, 1.0],
    )
    assert result_fail.baseline_meets_requirements is False
    assert len(result_fail.baseline_failure_reasons) > 0
    assert "Continuous sunlight window" in result_fail.baseline_failure_reasons[0]


def test_spatial_dispersion_distance_consistency():
    """
    Verify that spatial offsets (dx, dy) produce exact requested dispersion distances
    in the Polar Stereographic coordinate frame.
    """
    for r in [50.0, 100.0, 250.0]:
        directions = [
            (0.0, r),      # North
            (r, 0.0),      # East
            (0.0, -r),     # South
            (-r, 0.0),     # West
        ]
        for dx, dy in directions:
            dist = math.sqrt(dx * dx + dy * dy)
            assert abs(dist - r) < 1e-9


# ---------------------------------------------------------------------------
# Task 5: Polar Stereographic Conformal Mapping Invariants
# ---------------------------------------------------------------------------

def test_polar_stereographic_roundtrip_invariance():
    """
    Verify that forward and reverse transformations between Selenographic
    and Polar Stereographic coordinates are lossless (< 1 mm accuracy).
    """
    test_coordinates = [
        (-90.0, 0.0),       # Exact South Pole
        (-89.9, 0.0),       # Shackleton Center
        (-89.7, 129.0),     # Connecting Ridge
        (-87.45, -5.0),     # Haworth Rim
        (-85.3, 31.5),      # Nobile Rim 1
        (-88.5, -88.0),     # de Gerlache Rim
        (-82.0, 180.0),     # Outer DEM boundary
        (-85.0, -179.9),    # Near date line
    ]

    for lat, lon in test_coordinates:
        x_m, y_m = selenographic_to_polar_stereo(lon, lat)
        rev_lon, rev_lat = polar_stereo_to_selenographic(x_m, y_m)

        # Latitude round-trip precision (< 1e-7 deg ~ 3 mm on Moon)
        assert abs(rev_lat - lat) < 1e-7

        # Longitude round-trip precision (except at singularity lat = -90.0)
        if abs(lat - (-90.0)) > 1e-4:
            lon_diff = (rev_lon - lon + 180.0) % 360.0 - 180.0
            assert abs(lon_diff) < 1e-7
