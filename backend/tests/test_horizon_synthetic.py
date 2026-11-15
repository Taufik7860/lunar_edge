"""
Tests for Horizon Engine using synthetic DEM patches.
"""

import math
import numpy as np
import pytest

from app.engines.terrain_engine import DEMPatch
from app.engines.horizon_engine import compute_horizon_profile, interpolate_horizon


def create_flat_patch(size_pixels: int = 101, pixel_size_m: float = 80.0, elevation_val: float = 0.0) -> DEMPatch:
    """Helper to create a synthetic flat DEM patch."""
    half = (size_pixels // 2) * pixel_size_m
    x = np.linspace(-half, half, size_pixels)
    y = np.linspace(half, -half, size_pixels)  # decreasing Y
    elev = np.full((size_pixels, size_pixels), elevation_val, dtype=np.float32)
    mask = np.zeros((size_pixels, size_pixels), dtype=bool)

    return DEMPatch(
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_elevation_m=elevation_val,
        x_coords=x,
        y_coords=y,
        elevation_m=elev,
        nodata_mask=mask,
        pixel_size_m=pixel_size_m,
        radius_m=half,
    )


def test_horizon_flat_patch():
    """Flat terrain horizon should be near 0° (or slightly negative due to lunar curvature)."""
    patch = create_flat_patch()
    horizon = compute_horizon_profile(patch, n_azimuths=72, min_range_m=100.0)

    assert len(horizon) == 72
    # On flat terrain with lunar curvature, horizon drops slightly below 0° or stays near 0°
    assert np.all(horizon <= 0.05)
    assert np.all(horizon >= -2.0)


def test_horizon_mountain_to_north():
    """Synthetic mountain directly to the North (+Y direction) creates a peak at azimuth 0°."""
    patch = create_flat_patch(size_pixels=101, pixel_size_m=80.0, elevation_val=0.0)
    # Observer is at center (row 50, col 50).
    # North is decreasing row index (y > 0). Let's place a 500m peak at row 20, col 50 (distance ~ 30*80 = 2400m North)
    # Expected elevation angle: atan(500 / 2400) ~ 11.77°
    patch.elevation_m[20, 50] = 500.0

    horizon = compute_horizon_profile(patch, n_azimuths=360, min_range_m=100.0)

    # Azimuth 0° is North
    h_north = horizon[0]
    # Expected angle around ~11° - 12°
    assert 10.0 < h_north < 13.0

    # East (90°), South (180°), West (270°) should be near flat
    assert horizon[90] <= 0.05
    assert horizon[180] <= 0.05
    assert horizon[270] <= 0.05


def test_interpolate_horizon():
    """Verify linear interpolation between azimuth bins."""
    horizon = np.array([0.0, 10.0, 20.0, 30.0], dtype=np.float64)  # 4 bins: 0°, 90°, 180°, 270°

    # Exact bin values
    assert interpolate_horizon(horizon, 0.0) == 0.0
    assert interpolate_horizon(horizon, 90.0) == 10.0
    assert interpolate_horizon(horizon, 180.0) == 20.0
    assert interpolate_horizon(horizon, 270.0) == 30.0

    # Midpoints
    assert interpolate_horizon(horizon, 45.0) == pytest.approx(5.0)
    assert interpolate_horizon(horizon, 135.0) == pytest.approx(15.0)

    # Wrap-around between 270° and 360° (0°)
    # at 315° (halfway between 270° [30.0] and 360° [0.0]): 15.0
    assert interpolate_horizon(horizon, 315.0) == pytest.approx(15.0)
