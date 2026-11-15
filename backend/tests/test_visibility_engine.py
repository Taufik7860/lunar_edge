"""
Tests for Visibility Engine (Solar disc occultation, Earth line-of-sight, mission windows).
"""

import math
import numpy as np
import pytest

from app.engines.visibility_engine import (
    compute_solar_disc_fraction,
    compute_terrain_visibility_time_series,
)
from app.models.schemas import TimeSeriesSample


def test_solar_disc_fraction_extremes():
    """Verify 0%, 50%, and 100% solar disc visibility formulas."""
    radius = 0.26  # degrees

    # 1. Fully visible (clearance >= radius)
    assert compute_solar_disc_fraction(0.30, radius) == 1.0
    assert compute_solar_disc_fraction(0.26, radius) == 1.0

    # 2. Exactly centered on knife-edge horizon (clearance == 0)
    half_frac = compute_solar_disc_fraction(0.0, radius)
    assert abs(half_frac - 0.5) < 1e-6

    # 3. Fully obscured (clearance <= -radius)
    assert compute_solar_disc_fraction(-0.30, radius) == 0.0
    assert compute_solar_disc_fraction(-0.26, radius) == 0.0

    # 4. Partial visibility strictly monotonic
    f1 = compute_solar_disc_fraction(-0.13, radius)
    f2 = compute_solar_disc_fraction(0.0, radius)
    f3 = compute_solar_disc_fraction(0.13, radius)
    assert 0.0 < f1 < f2 < f3 < 1.0


def test_visibility_time_series_logic():
    """Test full visibility evaluation on synthetic geometry samples."""
    # Synthetic horizon profile: 2° elevation to the East (azimuth 90°), 0° elsewhere
    horizon = np.zeros(360, dtype=np.float64)
    horizon[85:95] = 2.0

    # Synthetic sample 1: Sun at azimuth 0 (horizon 0°), elevation +1.5° -> Sunlit
    # Earth at azimuth 180 (horizon 0°), elevation +5.0° -> Earth visible
    s1 = TimeSeriesSample(
        et=1000.0,
        utc="2026-01-01T00:00:00Z",
        sun_azimuth_deg=0.0,
        sun_elevation_deg=1.5,
        sun_distance_km=149597870.0,
        sun_angular_radius_deg=0.26,
        sun_angular_diameter_deg=0.52,
        earth_azimuth_deg=180.0,
        earth_elevation_deg=5.0,
        earth_distance_km=384400.0,
        earth_angular_radius_deg=0.95,
        earth_angular_diameter_deg=1.90,
        solar_incidence_angle_deg=88.5,
        solar_cosine_incidence=0.026,
        is_sun_above_geometric_horizon=True,
        is_sun_disc_partially_above_geometric_horizon=True,
        is_earth_above_geometric_horizon=True,
        is_earth_disc_partially_above_geometric_horizon=True,
    )

    # Synthetic sample 2: Sun at azimuth 90° (horizon 2.0°), elevation 1.0° -> Obscured behind 2.0° crater rim!
    # Geometric elevation is +1.0° (above spherical horizon), but blocked by 2.0° terrain!
    s2 = TimeSeriesSample(
        et=1900.0,
        utc="2026-01-01T00:15:00Z",
        sun_azimuth_deg=90.0,
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

    response = compute_terrain_visibility_time_series([s1, s2], horizon, "Test Peak")
    samples = response.samples
    assert len(samples) == 2

    # Sample 1: clearance = 1.5 - 0.0 = 1.5 > 0.26 -> sunlit, earth visible, simultaneous
    assert samples[0].is_sunlit is True
    assert samples[0].is_earth_visible is True
    assert samples[0].is_simultaneous_operating is True

    # Sample 2: clearance = 1.0 - 2.0 = -1.0 < -0.26 -> totally dark!
    assert samples[1].is_sunlit is False
    assert samples[1].sun_illumination_fraction == 0.0
    assert samples[1].is_earth_visible is True
    assert samples[1].is_simultaneous_operating is False  # No power!
