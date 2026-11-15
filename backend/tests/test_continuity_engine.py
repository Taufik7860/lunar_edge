"""
Tests for Mission Continuity Envelope Engine.
"""

import pytest

from app.engines.continuity_engine import ContinuityEngine
from app.models.schemas import LandingSite, MissionRequirements


def test_continuity_envelope_evaluation():
    """Verify deterministic sensitivity and robustness scoring."""
    engine = ContinuityEngine()

    site = LandingSite(
        name="Test South Pole Site",
        latitude_deg=-89.5,
        longitude_deg=0.0,
        elevation_m=500.0,
        slope_deg=2.0,
        aspect_deg=90.0,
    )

    # Moderate requirements
    reqs = MissionRequirements(
        min_continuous_sunlight_hours=24.0,
        max_tolerable_dark_hours=72.0,
        min_continuous_earth_comms_hours=12.0,
        min_simultaneous_operating_hours=12.0,
    )

    result = engine.evaluate_continuity_envelope(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=3.0,
        step_minutes=60.0,
        requirements=reqs,
        spatial_radii_m=[100.0],
        temporal_offsets_days=[-1.0, 1.0],
    )

    # 4 spatial points (N, E, S, W) + 2 temporal points (-1d, +1d) = 6 perturbations
    assert len(result.perturbations) == 6
    assert 0.0 <= result.spatial_success_rate <= 1.0
    assert 0.0 <= result.temporal_success_rate <= 1.0
    assert 0.0 <= result.overall_robustness_score <= 1.0

    # Verify perturbation parameters
    for p in result.perturbations:
        assert p.evaluated_start_utc is not None
        assert p.sunlit_hours >= 0.0
        assert p.longest_sunlit_window_hours >= 0.0
        assert p.longest_dark_period_hours >= 0.0
        if not p.meets_requirements:
            assert len(p.failure_reasons) > 0
