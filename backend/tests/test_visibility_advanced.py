"""
test_visibility_advanced.py — Advanced precision validation for VisibilityEngine.

Validates:
1. Solar and Earth disc occultation exact symmetry: f(x) + f(-x) == 1.0.
2. Monotonicity of circular segment area across 50 fine clearance steps.
3. Earth visible fraction calculation and semi-diameter clearance.
4. Topographic obstruction overriding geometric line-of-sight.
5. Multi-day mission interval extraction and mathematical time conservation.
6. Simultaneous power and comms operational window intersection.
"""

import math
import numpy as np
import pytest

from app.engines.visibility_engine import (
    compute_solar_disc_fraction,
    compute_terrain_visibility_time_series,
)
from app.models.schemas import TimeSeriesSample


def test_circular_segment_symmetry_and_monotonicity():
    """
    Symmetry: For any knife-edge occultation, the visible fraction f(x)
    and obscured fraction f(-x) must sum to exactly 1.0 (analytical identity).
    Monotonicity: f(x1) < f(x2) for all x1 < x2 in [-1, 1].
    """
    radius = 0.265
    xs = np.linspace(-radius, radius, 51)
    fractions = [compute_solar_disc_fraction(float(x), radius) for x in xs]

    # Check symmetry: f(x) + f(-x) == 1.0
    for i in range(len(xs)):
        f_pos = fractions[i]
        f_neg = fractions[-(i + 1)]
        assert abs(f_pos + f_neg - 1.0) < 1e-6, f"Symmetry violated at x={xs[i]}"

    # Check strict monotonicity
    for i in range(len(fractions) - 1):
        assert fractions[i] < fractions[i + 1], "Monotonicity violated in circular occultation"


def test_earth_visible_fraction_calculation():
    """Verify Earth disc fraction behaves symmetrically with angular radius ~0.95°."""
    r_earth = 0.95

    # Full Earth disc visible
    assert compute_solar_disc_fraction(1.5, r_earth) == 1.0
    # Half Earth visible (center at horizon)
    assert compute_solar_disc_fraction(0.0, r_earth) == pytest.approx(0.50, abs=1e-6)
    # Fully obscured
    assert compute_solar_disc_fraction(-1.2, r_earth) == 0.0


def test_terrain_blocking_vs_geometric_visibility():
    """
    Demonstrate that positive geometric elevation does NOT grant visibility
    when obstructed by high terrain topography.
    """
    # High terrain ridge to the North: 5.0° elevation
    horizon = np.zeros(360, dtype=np.float64)
    horizon[350:360] = 5.0
    horizon[0:10] = 5.0

    # Sun at azimuth 0°, geometric elevation +2.0° (above spherical horizon)
    # Earth at azimuth 0°, geometric elevation +3.0° (above spherical horizon)
    sample = TimeSeriesSample(
        et=1000.0,
        utc="2026-07-01T00:00:00Z",
        sun_azimuth_deg=0.0,
        sun_elevation_deg=2.0,
        sun_distance_km=1.5e8,
        sun_angular_radius_deg=0.26,
        sun_angular_diameter_deg=0.52,
        earth_azimuth_deg=0.0,
        earth_elevation_deg=3.0,
        earth_distance_km=3.8e5,
        earth_angular_radius_deg=0.95,
        earth_angular_diameter_deg=1.90,
        solar_incidence_angle_deg=88.0,
        solar_cosine_incidence=0.035,
        is_sun_above_geometric_horizon=True,
        is_sun_disc_partially_above_geometric_horizon=True,
        is_earth_above_geometric_horizon=True,
        is_earth_disc_partially_above_geometric_horizon=True,
    )

    resp = compute_terrain_visibility_time_series([sample], horizon, "Shadowed Valley")
    res_sample = resp.samples[0]

    # Geometric elevation was +2.0°, but terrain is +5.0° -> Clearance = -3.0°
    assert res_sample.sun_clearance_deg == pytest.approx(-3.0)
    assert res_sample.sun_illumination_fraction == 0.0
    assert res_sample.is_sunlit is False

    # Earth geometric elevation was +3.0°, but terrain is +5.0° -> Clearance = -2.0°
    assert res_sample.earth_clearance_deg == pytest.approx(-2.0)
    assert res_sample.is_earth_visible is False
    assert res_sample.earth_visible_fraction == 0.0

    # Simultaneous operation impossible in complete terrain shadow & comms blackout
    assert res_sample.is_simultaneous_operating is False


def test_mission_interval_time_conservation():
    """Verify that contiguous interval extraction conserves total mission duration."""
    horizon = np.zeros(360, dtype=np.float64)

    # 48 hours of 1-hour samples: alternating 24h sunlit then 24h dark
    samples = []
    for h in range(48):
        et = 1000.0 + h * 3600.0
        is_sun = (h < 24)
        sun_el = 1.0 if is_sun else -2.0
        earth_el = 5.0 if (h % 12 < 6) else -1.0

        samples.append(
            TimeSeriesSample(
                et=et,
                utc=f"2026-07-01T{h:02d}:00:00Z" if h < 24 else f"2026-07-02T{h-24:02d}:00:00Z",
                sun_azimuth_deg=float(h * 7.5),
                sun_elevation_deg=sun_el,
                sun_distance_km=1.5e8,
                sun_angular_radius_deg=0.26,
                sun_angular_diameter_deg=0.52,
                earth_azimuth_deg=180.0,
                earth_elevation_deg=earth_el,
                earth_distance_km=3.8e5,
                earth_angular_radius_deg=0.95,
                earth_angular_diameter_deg=1.90,
                solar_incidence_angle_deg=89.0,
                solar_cosine_incidence=0.017,
                is_sun_above_geometric_horizon=is_sun,
                is_sun_disc_partially_above_geometric_horizon=is_sun,
                is_earth_above_geometric_horizon=earth_el > 0,
                is_earth_disc_partially_above_geometric_horizon=earth_el > -0.95,
            )
        )

    resp = compute_terrain_visibility_time_series(samples, horizon, "Cyclic Test Site")
    summary = resp.summary

    assert summary.total_samples == 48
    assert summary.sunlit_hours == pytest.approx(24.0)
    assert summary.dark_hours == pytest.approx(24.0)
    assert summary.longest_sunlit_window_hours == pytest.approx(24.0)
    assert summary.longest_dark_period_hours == pytest.approx(24.0)

    # Intervals check
    sun_ivs = [iv for iv in summary.intervals if iv.type == "SUNLIT"]
    assert len(sun_ivs) == 1
    assert sun_ivs[0].duration_hours == pytest.approx(24.0)

    dark_ivs = [iv for iv in summary.intervals if iv.type == "DARK"]
    assert len(dark_ivs) == 1
    assert dark_ivs[0].duration_hours == pytest.approx(24.0)
