"""
visibility_engine.py — LUNAR EDGE Phase 3

Combines topocentric Sun and Earth ephemeris geometry with local terrain
horizon profiles to determine terrain-aware visibility, solar disc occultation,
direct communication line-of-sight, and mission operational windows.

Scientific Principles:
  1. Sun occultation:
     The Sun is an extended disc with apparent angular radius R_sun (~0.26° - 0.27°).
     As the Sun sets behind local crater rims or mountain peaks:
     - Clearance = Sun_Elevation - Horizon_Elevation(Sun_Azimuth)
     - Full daylight: Clearance >= R_sun (100% of solar disc unblocked)
     - Partial daylight: -R_sun < Clearance < R_sun (partial solar disc visible)
     - Solar disk visible fraction is calculated using the exact circular segment
       occultation formula:
         x = clamp(Clearance / R_sun, -1.0, 1.0)
         fraction = (1/pi) * (arccos(-x) + x * sqrt(1 - x^2))
     - Dark (total eclipse by terrain): Clearance <= -R_sun

  2. Earth line-of-sight:
     Direct-to-Earth (DTE) radio communication requires unobstructed line of sight.
     - Clearance = Earth_Elevation - Horizon_Elevation(Earth_Azimuth)
     - Earth visible: Clearance >= 0.0 (geometric center of Earth above terrain)

  3. Mission intervals and windows:
     Detects contiguous operating periods:
     - Continuous Sunlit windows
     - Continuous Dark periods (maximum duration defines battery capacity sizing)
     - Continuous Earth Comms windows
     - Simultaneous operating windows (Sunlit AND Earth Comms active)
"""

from __future__ import annotations

import logging
import math
from typing import List, Tuple, Optional

import numpy as np

from app.engines.horizon_engine import interpolate_horizon
from app.models.schemas import (
    TimeSeriesSample,
    VisibilitySample,
    MissionInterval,
    VisibilitySummary,
    VisibilityTimeSeriesResponse,
)

logger = logging.getLogger(__name__)


def compute_solar_disc_fraction(clearance_deg: float, angular_radius_deg: float) -> float:
    """
    Computes the fraction [0.0, 1.0] of the solar disc visible above a knife-edge terrain horizon.

    Uses the exact geometric formula for circular segment area:
      x = clearance / radius in [-1, 1]
      area_fraction = (1 / pi) * [ arccos(-x) + x * sqrt(1 - x^2) ]
    """
    if angular_radius_deg <= 1e-6:
        return 1.0 if clearance_deg >= 0.0 else 0.0

    x = clearance_deg / angular_radius_deg
    if x >= 1.0:
        return 1.0
    if x <= -1.0:
        return 0.0

    # Exact circular cap area fraction
    fraction = (1.0 / math.pi) * (math.acos(-x) + x * math.sqrt(1.0 - x * x))
    return float(np.clip(fraction, 0.0, 1.0))


def compute_terrain_visibility_time_series(
    geometry_samples: List[TimeSeriesSample],
    horizon_profile: np.ndarray,
    site_name: str = "Unknown Site",
) -> VisibilityTimeSeriesResponse:
    """
    Evaluates terrain-obstructed visibility for each geometric sample in the mission time series.

    Args:
        geometry_samples: List of TimeSeriesSample from GeometryEngine/SPICEService
        horizon_profile: Array of horizon elevations from HorizonEngine (e.g. 360 values for 1° bins)
        site_name: Name of landing location

    Returns:
        VisibilityTimeSeriesResponse with summary statistics and per-sample visibility states.
    """
    if not geometry_samples:
        raise ValueError("geometry_samples cannot be empty.")

    samples: List[VisibilitySample] = []
    
    # Calculate step in hours from first two samples if available
    if len(geometry_samples) > 1:
        dt_seconds = geometry_samples[1].et - geometry_samples[0].et
        dt_hours = dt_seconds / 3600.0
    else:
        dt_hours = 0.25 # default 15 min

    total_samples = len(geometry_samples)
    duration_days = (total_samples * dt_hours) / 24.0

    for s in geometry_samples:
        # 1. Sun terrain clearance & disc occultation
        h_sun = interpolate_horizon(horizon_profile, s.sun_azimuth_deg)
        sun_clearance = s.sun_elevation_deg - h_sun
        sun_frac = compute_solar_disc_fraction(sun_clearance, s.sun_angular_radius_deg)
        
        is_sunlit = (sun_frac >= 0.5)  # Majority of disc visible
        is_sun_partial = (0.0 < sun_frac < 1.0)
        
        # 2. Earth terrain clearance & line of sight
        h_earth = interpolate_horizon(horizon_profile, s.earth_azimuth_deg)
        earth_clearance = s.earth_elevation_deg - h_earth
        is_earth_vis = (earth_clearance >= 0.0)
        
        # 3. Simultaneous operation (power + comms)
        is_simultaneous = (sun_frac > 0.0) and is_earth_vis
        
        samples.append(
            VisibilitySample(
                et=s.et,
                utc=s.utc,
                sun_azimuth_deg=s.sun_azimuth_deg,
                sun_elevation_deg=s.sun_elevation_deg,
                sun_angular_radius_deg=s.sun_angular_radius_deg,
                sun_horizon_elevation_deg=h_sun,
                sun_clearance_deg=sun_clearance,
                sun_illumination_fraction=sun_frac,
                is_sunlit=is_sunlit,
                is_sun_partial=is_sun_partial,
                earth_azimuth_deg=s.earth_azimuth_deg,
                earth_elevation_deg=s.earth_elevation_deg,
                earth_angular_radius_deg=s.earth_angular_radius_deg,
                earth_horizon_elevation_deg=h_earth,
                earth_clearance_deg=earth_clearance,
                is_earth_visible=is_earth_vis,
                is_simultaneous_operating=is_simultaneous,
            )
        )

    # 4. Extract continuous intervals
    sunlit_mask = np.array([sp.is_sunlit for sp in samples], dtype=bool)
    dark_mask = np.array([sp.sun_illumination_fraction == 0.0 for sp in samples], dtype=bool)
    earth_mask = np.array([sp.is_earth_visible for sp in samples], dtype=bool)
    simul_mask = np.array([sp.is_simultaneous_operating for sp in samples], dtype=bool)

    sun_intervals = _extract_intervals(samples, sunlit_mask, "SUNLIT", dt_hours)
    dark_intervals = _extract_intervals(samples, dark_mask, "DARK", dt_hours)
    earth_intervals = _extract_intervals(samples, earth_mask, "EARTH_VISIBLE", dt_hours)
    earth_blackout_intervals = _extract_intervals(samples, ~earth_mask, "EARTH_BLOCKED", dt_hours)
    simul_intervals = _extract_intervals(samples, simul_mask, "SIMULTANEOUS", dt_hours)

    all_intervals = sun_intervals + dark_intervals + earth_intervals + earth_blackout_intervals + simul_intervals

    # 5. Summaries and duration statistics
    sunlit_hours = float(np.sum([sp.sun_illumination_fraction for sp in samples]) * dt_hours)
    partial_hours = float(np.sum([1 for sp in samples if sp.is_sun_partial]) * dt_hours)
    dark_hours = float(np.sum(dark_mask) * dt_hours)
    total_hours = total_samples * dt_hours

    earth_vis_hours = float(np.sum(earth_mask) * dt_hours)
    simul_hours = float(np.sum(simul_mask) * dt_hours)

    longest_sunlit = max([iv.duration_hours for iv in sun_intervals], default=0.0)
    longest_dark = max([iv.duration_hours for iv in dark_intervals], default=0.0)
    longest_earth = max([iv.duration_hours for iv in earth_intervals], default=0.0)
    longest_blackout = max([iv.duration_hours for iv in earth_blackout_intervals], default=0.0)
    longest_simul = max([iv.duration_hours for iv in simul_intervals], default=0.0)

    summary = VisibilitySummary(
        site_name=site_name,
        start_utc=samples[0].utc,
        duration_days=duration_days,
        step_minutes=dt_hours * 60.0,
        total_samples=total_samples,
        sunlit_hours=round(sunlit_hours, 2),
        partial_hours=round(partial_hours, 2),
        dark_hours=round(dark_hours, 2),
        sunlit_fraction=round(sunlit_hours / max(total_hours, 1e-6), 4),
        longest_sunlit_window_hours=round(longest_sunlit, 2),
        longest_dark_period_hours=round(longest_dark, 2),
        earth_visible_hours=round(earth_vis_hours, 2),
        earth_visible_fraction=round(earth_vis_hours / max(total_hours, 1e-6), 4),
        longest_earth_visible_window_hours=round(longest_earth, 2),
        longest_earth_blackout_hours=round(longest_blackout, 2),
        simultaneous_hours=round(simul_hours, 2),
        simultaneous_fraction=round(simul_hours / max(total_hours, 1e-6), 4),
        longest_simultaneous_window_hours=round(longest_simul, 2),
        intervals=all_intervals,
    )

    return VisibilityTimeSeriesResponse(summary=summary, samples=samples)


def _extract_intervals(
    samples: List[VisibilitySample],
    condition_mask: np.ndarray,
    interval_type: str,
    dt_hours: float,
) -> List[MissionInterval]:
    """Extract contiguous blocks where condition_mask is True."""
    intervals: List[MissionInterval] = []
    in_interval = False
    start_idx = 0

    for i, cond in enumerate(condition_mask):
        if cond and not in_interval:
            in_interval = True
            start_idx = i
        elif not cond and in_interval:
            in_interval = False
            duration = (i - start_idx) * dt_hours
            intervals.append(
                MissionInterval(
                    type=interval_type,
                    start_utc=samples[start_idx].utc,
                    end_utc=samples[i - 1].utc,
                    duration_hours=round(duration, 2),
                )
            )

    # Handle interval that reaches end of mission window
    if in_interval:
        duration = (len(condition_mask) - start_idx) * dt_hours
        intervals.append(
            MissionInterval(
                type=interval_type,
                start_utc=samples[start_idx].utc,
                end_utc=samples[-1].utc,
                duration_hours=round(duration, 2),
            )
        )

    return intervals
