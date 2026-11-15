"""
horizon_engine.py — LUNAR EDGE Phase 3 & 5

Computes the terrain horizon obstruction profile from a LOLA DEM patch.

For a surface observer at (observer_x_m, observer_y_m, observer_elevation_m)
this engine casts rays in N_AZ azimuth directions and, for each ray,
finds the maximum terrain elevation angle along the ray.

Output: horizon_profile[az_idx] = max terrain elevation angle [degrees]
  Shape: (N_AZ,)  where N_AZ defaults to 360 (1° steps)
  Azimuth convention: 0° = North, 90° = East, 180° = South, 270° = West
                       Clockwise, same as navigation convention.

Scientific notes:
  - Elevation angle = atan2(terrain_height - observer_height, horizontal_distance)
  - Horizontal distance is Euclidean in the patch Polar Stereo plane (metres)
  - Lunar surface curvature correction applied for all distances:
      effective_depression = horizontal_dist**2 / (2 * R_moon)
      corrected_target_height = terrain_height - effective_depression
    This accounts for the Moon's spherical curvature dropping away beneath rays.
  - Grid convergence correction:
      In LOLA Polar Stereographic (Central Meridian = 0°), local true North
      rotates by the observer's selenographic longitude. Rays are corrected so
      azimuth 0° always corresponds to true selenographic North.
  - Nodata cells are skipped (not treated as obstacles or flat terrain).
  - Physical minimum dip is bounded by the observer's spherical horizon dip:
      min_dip = -arccos(R / (R + h_obs)).
"""

from __future__ import annotations

import logging
import math
from typing import Optional, Dict

import numpy as np

from app.engines.terrain_engine import DEMPatch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MOON_RADIUS_M = 1_737_400.0   # IAU 2000 mean sphere radius [m]


# ---------------------------------------------------------------------------
# Horizon engine
# ---------------------------------------------------------------------------

def compute_horizon_profile(
    patch: DEMPatch,
    n_azimuths: int = 360,
    max_range_m: Optional[float] = None,
    min_range_m: float = 50.0,
    n_range_steps: int = 500,
) -> np.ndarray:
    """
    Compute the terrain horizon profile for the observer described in *patch*.

    Args:
        patch:          DEMPatch from TerrainEngine.extract_patch().
        n_azimuths:     Number of azimuth directions (default 360 → 1° steps).
        max_range_m:    Maximum ray length [m]. Defaults to patch.radius_m.
        min_range_m:    Minimum range before the first sample [m].
                        Excludes the observer's own cell from the horizon.
        n_range_steps:  Number of samples along each ray (adaptive upscaling if needed).

    Returns:
        horizon_profile: np.ndarray shape (n_azimuths,), dtype float64 [degrees].
                         horizon_profile[i] = maximum terrain elevation angle
                         in the direction of azimuth i × (360/n_azimuths) degrees.
                         0° = terrain at observer horizon level.
                         Positive = terrain above horizon (blocking line of sight).
                         Negative = terrain dips below horizontal tangent plane.
    """
    if max_range_m is None:
        max_range_m = patch.radius_m

    obs_x = patch.observer_x_m
    obs_y = patch.observer_y_m
    obs_e = patch.observer_elevation_m

    # Azimuth array [0, 360)
    az_step = 360.0 / n_azimuths
    azimuths_deg = np.arange(n_azimuths) * az_step

    horizon = np.zeros(n_azimuths, dtype=np.float64)

    # Determine observer's selenographic longitude for grid convergence correction
    if hasattr(patch, "observer_lon_deg") and patch.observer_lon_deg is not None:
        obs_lon_deg = float(patch.observer_lon_deg)
    else:
        r_obs = math.sqrt(obs_x**2 + obs_y**2)
        obs_lon_deg = float(math.degrees(math.atan2(obs_x, obs_y))) if r_obs >= 1e-3 else 0.0

    # Grid convergence correction:
    # In LOLA Polar Stereographic (Central Meridian = 0°):
    # True North (along local meridian away from South pole) is at angle lambda from +Y.
    # True East (increasing longitude) is at angle lambda + 90° from +Y.
    # Therefore, a ray at topocentric azimuth A (clockwise from True North) points in PS grid direction:
    #   ray_dx = sin(A + lambda)
    #   ray_dy = cos(A + lambda)
    az_rad = np.deg2rad(azimuths_deg + obs_lon_deg)
    ray_dx = np.sin(az_rad)   # East component in PS grid
    ray_dy = np.cos(az_rad)   # North component in PS grid

    # Adaptive range sampling: ensure range step <= 0.75 * pixel_size_m (Nyquist rate)
    px_size = max(10.0, float(patch.pixel_size_m))
    adaptive_steps = int(math.ceil((max_range_m - min_range_m) / (px_size * 0.75)))
    actual_range_steps = max(n_range_steps, adaptive_steps)
    ranges = np.linspace(min_range_m, max_range_m, actual_range_steps)

    # Patch grid coordinate mapping helpers
    x0 = patch.x_coords[0]
    px = patch.pixel_size_m
    y0 = patch.y_coords[0]
    py = patch.y_coords[1] - patch.y_coords[0]  # signed pixel step in Y

    n_rows_p, n_cols_p = patch.elevation_m.shape
    curve_table = ranges**2 / (2.0 * MOON_RADIUS_M)

    for i in range(n_azimuths):
        rdx = ray_dx[i]
        rdy = ray_dy[i]

        # Sample coordinates along this ray
        sx = obs_x + ranges * rdx
        sy = obs_y + ranges * rdy

        col_f = (sx - x0) / px
        row_f = (sy - y0) / py

        col_i = np.round(col_f).astype(int)
        row_i = np.round(row_f).astype(int)

        # Keep only samples within patch bounds
        in_bounds = (
            (col_i >= 0) & (col_i < n_cols_p) &
            (row_i >= 0) & (row_i < n_rows_p)
        )

        if not np.any(in_bounds):
            horizon[i] = 0.0
            continue

        rows_ok = row_i[in_bounds]
        cols_ok = col_i[in_bounds]
        ranges_ok = ranges[in_bounds]
        curve_ok = curve_table[in_bounds]

        # Get elevations at sample points
        sample_elev = patch.elevation_m[rows_ok, cols_ok]
        sample_valid = ~np.isnan(sample_elev)

        if not np.any(sample_valid):
            horizon[i] = 0.0
            continue

        # Effective height difference accounting for lunar curvature drop
        h_diff = sample_elev - obs_e - curve_ok
        el_ang = np.degrees(np.arctan2(h_diff, ranges_ok))

        # Only consider valid DEM cells
        el_ang[~sample_valid] = -90.0
        horizon[i] = float(np.max(el_ang))

    # Clamp to physically reasonable range based on lunar curvature and observer elevation
    if obs_e > 0.0:
        min_horizon_dip = -float(np.degrees(np.arccos(MOON_RADIUS_M / (MOON_RADIUS_M + obs_e))))
        horizon = np.clip(horizon, max(-5.0, min_horizon_dip), 89.9)
    else:
        horizon = np.clip(horizon, -5.0, 89.9)

    return horizon


def interpolate_horizon(
    horizon_profile: np.ndarray,
    azimuth_deg: float,
) -> float:
    """
    Linearly interpolate the horizon elevation angle at an arbitrary azimuth.

    Args:
        horizon_profile: Shape (N,) where azimuths are 0, 360/N, 2×360/N, ...
        azimuth_deg:     Query azimuth [degrees], any value (wrapped to [0, 360)).

    Returns:
        Interpolated horizon elevation angle [degrees].
    """
    n = len(horizon_profile)
    az_deg = azimuth_deg % 360.0
    idx_f = az_deg / (360.0 / n)

    idx0 = int(math.floor(idx_f)) % n
    idx1 = (idx0 + 1) % n
    t = idx_f - math.floor(idx_f)

    return float((1.0 - t) * horizon_profile[idx0] + t * horizon_profile[idx1])


def compute_horizon_statistics(horizon_profile: np.ndarray) -> Dict[str, float]:
    """
    Compute statistical summary and solid-angle sky visibility from a horizon profile.

    Returns:
        min_deg: lowest terrain horizon obstruction angle [deg]
        max_deg: highest obstacle angle [deg]
        mean_deg: azimuth-averaged horizon obstruction angle [deg]
        std_deg: standard deviation of horizon elevations [deg]
        sky_visibility_fraction: fraction of upper hemisphere visible to observer [0.0 - 1.0]
    """
    profile = np.asarray(horizon_profile, dtype=np.float64)
    min_val = float(np.min(profile))
    max_val = float(np.max(profile))
    mean_val = float(np.mean(profile))
    std_val = float(np.std(profile))

    # Sky visibility solid angle fraction:
    # Integral over azimuth of (1 - sin(max(0, theta))) / 2pi
    # For positive horizon angles, terrain blocks fraction sin(theta) of upper hemisphere
    thetas_rad = np.radians(np.clip(profile, 0.0, 90.0))
    sky_vis = float(np.mean(1.0 - np.sin(thetas_rad)))

    return {
        "min_deg": min_val,
        "max_deg": max_val,
        "mean_deg": mean_val,
        "std_deg": std_val,
        "sky_visibility_fraction": sky_vis,
    }
