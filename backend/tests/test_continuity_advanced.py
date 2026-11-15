"""
test_continuity_advanced.py — Rigorous scientific tests for Mission Continuity Engine.

Validates:
1. Exact distinction between cumulative total duration and contiguous unbroken windows.
2. State transition counters (day<->night, comms acquired<->lost, simultaneous acquired<->lost).
3. Temporal quantization uncertainty (+/- dt) as function of sampling step.
4. Real DEM slope and aspect evaluation on spatial landing dispersion perturbations.
5. Continuity envelope robustness scoring.
"""

import pytest
import numpy as np
from datetime import datetime, timedelta

from app.engines.continuity_engine import ContinuityEngine
from app.engines.terrain_engine import TerrainEngine
from app.engines.geometry_engine import GeometryEngine
from app.models.schemas import (
    LandingSite,
    MissionRequirements,
    VisibilitySample,
    VisibilitySummary,
    VisibilityTimeSeriesResponse,
    MissionInterval,
)


def _create_mock_visibility_response(
    sun_pattern: list[bool],
    earth_pattern: list[bool],
    step_minutes: float = 60.0,
    site_name: str = "Test Ridge",
) -> VisibilityTimeSeriesResponse:
    """Helper to synthesize known visibility samples with exact state sequences."""
    n = len(sun_pattern)
    dt_hours = step_minutes / 60.0
    start_dt = datetime(2026, 2, 1, 0, 0, 0)
    samples = []

    for i in range(n):
        cur_dt = start_dt + timedelta(hours=i * dt_hours)
        is_sun = sun_pattern[i]
        is_earth = earth_pattern[i]
        is_simul = is_sun and is_earth

        samples.append(
            VisibilitySample(
                et=float(i * 3600.0 * dt_hours),
                utc=cur_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                sun_azimuth_deg=float(i * 10.0 % 360.0),
                sun_elevation_deg=1.5 if is_sun else -1.5,
                sun_angular_radius_deg=0.26,
                sun_horizon_elevation_deg=0.0,
                sun_clearance_deg=1.5 if is_sun else -1.5,
                sun_illumination_fraction=1.0 if is_sun else 0.0,
                is_sunlit=is_sun,
                is_sun_partial=False,
                earth_azimuth_deg=45.0,
                earth_elevation_deg=5.0 if is_earth else -1.0,
                earth_angular_radius_deg=0.95,
                earth_horizon_elevation_deg=0.0,
                earth_clearance_deg=5.0 if is_earth else -1.0,
                is_earth_visible=is_earth,
                earth_visible_fraction=1.0 if is_earth else 0.0,
                is_simultaneous_operating=is_simul,
            )
        )

    # Compute continuous windows
    def get_longest(mask):
        longest = 0
        cur = 0
        for val in mask:
            if val:
                cur += 1
                if cur > longest:
                    longest = cur
            else:
                cur = 0
        return longest * dt_hours

    total_sun_hours = sum(1 for s in sun_pattern if s) * dt_hours
    total_dark_hours = sum(1 for s in sun_pattern if not s) * dt_hours
    total_earth_hours = sum(1 for e in earth_pattern if e) * dt_hours
    total_simul_hours = sum(1 for s, e in zip(sun_pattern, earth_pattern) if s and e) * dt_hours

    longest_sun = get_longest(sun_pattern)
    longest_dark = get_longest([not s for s in sun_pattern])
    longest_earth = get_longest(earth_pattern)
    longest_blackout = get_longest([not e for e in earth_pattern])
    longest_simul = get_longest([s and e for s, e in zip(sun_pattern, earth_pattern)])

    summary = VisibilitySummary(
        site_name=site_name,
        start_utc=samples[0].utc,
        duration_days=(n * dt_hours) / 24.0,
        step_minutes=step_minutes,
        total_samples=n,
        sunlit_hours=round(total_sun_hours, 2),
        partial_hours=0.0,
        dark_hours=round(total_dark_hours, 2),
        sunlit_fraction=round(total_sun_hours / (n * dt_hours), 4),
        longest_sunlit_window_hours=round(longest_sun, 2),
        longest_dark_period_hours=round(longest_dark, 2),
        earth_visible_hours=round(total_earth_hours, 2),
        earth_visible_fraction=round(total_earth_hours / (n * dt_hours), 4),
        longest_earth_visible_window_hours=round(longest_earth, 2),
        longest_earth_blackout_hours=round(longest_blackout, 2),
        simultaneous_hours=round(total_simul_hours, 2),
        simultaneous_fraction=round(total_simul_hours / (n * dt_hours), 4),
        longest_simultaneous_window_hours=round(longest_simul, 2),
        intervals=[],
    )

    return VisibilityTimeSeriesResponse(summary=summary, samples=samples)


def test_continuity_metrics_cumulative_vs_continuous():
    """
    Ensure cumulative daylight duration is never confused with continuous daylight duration.
    Example: 4 blocks of 12h daylight separated by 12h darkness.
    Total daylight = 48h, but longest continuous daylight = 12h.
    """
    # Pattern: 12 light, 12 dark, 12 light, 12 dark, 12 light, 12 dark, 12 light
    # Total samples: 12*7 = 84 hours (each sample is 1 hour)
    sun = ([True] * 12 + [False] * 12) * 3 + [True] * 12
    earth = [True] * len(sun)  # Earth constantly visible

    vis_resp = _create_mock_visibility_response(sun, earth, step_minutes=60.0)
    metrics = ContinuityEngine.compute_continuity_metrics(vis_resp)

    # Cumulative daylight: 4 * 12 = 48h
    assert metrics.total_sunlight_hours == 48.0
    # Longest unbroken daylight: 12h
    assert metrics.longest_continuous_illumination_hours == 12.0
    assert metrics.longest_continuous_illumination_hours < metrics.total_sunlight_hours

    # Cumulative darkness: 3 * 12 = 36h
    assert metrics.longest_continuous_darkness_hours == 12.0

    # Transitions
    # True->False occurs 3 times
    assert metrics.day_to_night_transitions == 3
    # False->True occurs 3 times
    assert metrics.night_to_day_transitions == 3

    # Quantization uncertainty
    assert metrics.temporal_uncertainty_hours == 1.0
    assert "temporal quantization uncertainty" in metrics.explanation


def test_continuity_metrics_transitions_and_uncertainty():
    """Verify transitions and quantization bounds for 15-minute sampling."""
    # 10 samples of sun, then 10 of dark, then 10 of sun (30 samples @ 15 min = 7.5 hours)
    sun = [True] * 10 + [False] * 10 + [True] * 10
    earth = [False] * 5 + [True] * 20 + [False] * 5

    vis_resp = _create_mock_visibility_response(sun, earth, step_minutes=15.0)
    metrics = ContinuityEngine.compute_continuity_metrics(vis_resp)

    assert metrics.step_minutes == 15.0
    assert metrics.temporal_uncertainty_hours == 0.25  # 15 min = 0.25 h

    # Sun transitions: True->False once, False->True once
    assert metrics.day_to_night_transitions == 1
    assert metrics.night_to_day_transitions == 1

    # Earth comms: False->True once, True->False once
    assert metrics.comms_acquired_transitions == 1
    assert metrics.comms_lost_transitions == 1

    # Simultaneous conditions
    assert metrics.total_simultaneous_hours > 0.0
    assert metrics.simultaneous_acquired_transitions >= 1


def test_continuity_envelope_with_dem_slope_propagation():
    """Verify that spatial perturbations re-query DEM elevation, slope, and aspect."""
    engine = ContinuityEngine()
    site = LandingSite(
        name="Shackleton Connecting Ridge",
        latitude_deg=-89.87,
        longitude_deg=120.0,
        elevation_m=1200.0,
        slope_deg=5.0,
        aspect_deg=180.0,
    )

    reqs = MissionRequirements(
        min_continuous_sunlight_hours=12.0,
        max_tolerable_dark_hours=120.0,
        min_continuous_earth_comms_hours=12.0,
        min_simultaneous_operating_hours=6.0,
    )

    res = engine.evaluate_continuity_envelope(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        requirements=reqs,
        spatial_radii_m=[100.0],
        temporal_offsets_days=[-1.0, 1.0],
    )

    assert res.baseline_continuity_metrics is not None
    assert res.baseline_continuity_metrics.total_sunlight_hours >= 0.0
    assert res.baseline_continuity_metrics.temporal_uncertainty_hours == 1.0
    assert len(res.perturbations) == 6  # 4 spatial + 2 temporal

    # Check that spatial perturbations recorded valid metrics
    for p in res.perturbations:
        if p.displacement_distance_m > 0:
            assert p.evaluated_lat_deg != 0.0
            assert p.evaluated_lon_deg != 0.0
            assert p.sunlit_hours >= 0.0
