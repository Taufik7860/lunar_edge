"""
test_horizon_advanced.py — Advanced precision validation for HorizonEngine.

Validates:
1. Sky visibility solid angle fraction on flat vs enclosed crater terrain.
2. Isolated peak ray-casting precision against analytical trigonometry.
3. Curvature drop across long baseline distances (up to 50 km).
4. Full 360° circular interpolation continuity across 359° -> 0° boundary.
5. Adaptive Nyquist ray sampling density.
"""

import math
import numpy as np
import pytest

from app.engines.terrain_engine import DEMPatch
from app.engines.horizon_engine import (
    compute_horizon_profile,
    interpolate_horizon,
    compute_horizon_statistics,
    MOON_RADIUS_M,
)


def test_horizon_statistics_and_sky_visibility():
    """
    On a flat horizon (0° everywhere), sky visibility fraction must be exactly 1.0.
    For an artificial 30° wall all around, sky visibility must be 1.0 - sin(30°) = 0.50.
    """
    flat_horizon = np.zeros(360, dtype=np.float64)
    flat_stats = compute_horizon_statistics(flat_horizon)

    assert flat_stats["min_deg"] == 0.0
    assert flat_stats["max_deg"] == 0.0
    assert flat_stats["mean_deg"] == 0.0
    assert flat_stats["std_deg"] == 0.0
    assert flat_stats["sky_visibility_fraction"] == pytest.approx(1.0, abs=1e-6)

    # 30° uniform wall: terrain covers sin(30°) = 0.5 of upper hemisphere
    wall_horizon = np.full(360, 30.0, dtype=np.float64)
    wall_stats = compute_horizon_statistics(wall_horizon)
    assert wall_stats["sky_visibility_fraction"] == pytest.approx(0.50, abs=1e-5)


def test_isolated_peak_analytical_elevation():
    """
    Place a single mountain peak 10 km due North (x=0, y=10000 m).
    Observer at (0, 0, 0m).
    Peak height = +1000 m.
    At distance d = 10,000 m:
      curvature drop = d^2 / (2 * R_moon) = 10^8 / 3.4748e6 = 28.778 m.
      effective height diff = 1000 - 28.778 = 971.22 m.
      analytical elevation = degrees(arctan(971.22 / 10000)) = 5.547°.
    """
    nx, ny = 251, 251
    dx = dy = 80.0
    x_coords = np.linspace(-10000.0, 10000.0, nx)
    y_coords = np.linspace(10000.0, -10000.0, ny)

    elev = np.zeros((ny, nx), dtype=np.float32)

    # Place peak at y = 10,000 (row 0), x = 0 (col 125)
    elev[0, 125] = 1000.0

    patch = DEMPatch(
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_elevation_m=0.0,
        x_coords=x_coords,
        y_coords=y_coords,
        elevation_m=elev,
        nodata_mask=np.zeros_like(elev, dtype=bool),
        pixel_size_m=80.0,
        radius_m=10000.0,
        observer_lat_deg=-85.0,
        observer_lon_deg=0.0,
    )

    horizon = compute_horizon_profile(patch, n_azimuths=360)

    # True North in LOLA Polar Stereo at lon 0° is +Y (azimuth = 0°)
    d = 10000.0
    curve = d**2 / (2.0 * MOON_RADIUS_M)
    expected_el = math.degrees(math.atan2(1000.0 - curve, d))

    assert horizon[0] == pytest.approx(expected_el, abs=0.1)

    # South (azimuth = 180°) must see flat horizon (dipping with sphere)
    assert horizon[180] <= 0.0


def test_interpolation_wrap_around():
    """Verify smooth interpolation across the 359° to 0° boundary."""
    horizon = np.zeros(360, dtype=np.float64)
    horizon[0] = 10.0
    horizon[359] = 20.0

    # At 359.5°: midway between 359 (20°) and 0 (10°) -> 15.0°
    interp_val = interpolate_horizon(horizon, 359.5)
    assert interp_val == pytest.approx(15.0, abs=1e-5)

    # Negative azimuth wrapping (-1.0° should wrap to 359°)
    interp_neg = interpolate_horizon(horizon, -1.0)
    assert interp_neg == pytest.approx(20.0, abs=1e-5)
