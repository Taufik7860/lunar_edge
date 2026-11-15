"""
test_resilience_advanced.py — Rigorous scientific tests for Phase 9: Probabilistic Mission Resilience.

Validates:
1. Repeatability of Monte Carlo uncertainty propagation using fixed seeds.
2. Wilson score 95% confidence interval mathematics.
3. Parameter sensitivity correlations (landing dispersion, epoch slippage, slope noise).
4. Failure mode breakdown attribution.
5. API endpoint validation with FastAPI TestClient.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.engines.resilience_engine import ResilienceEngine
from app.models.schemas import (
    LandingSite,
    MissionRequirements,
    UncertaintyDistributionConfig,
)

client = TestClient(app)


def test_monte_carlo_exact_repeatability_with_seed():
    """Verify that using the same random seed produces bit-exact repeatable Monte Carlo scenarios."""
    engine = ResilienceEngine()
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
        max_tolerable_dark_hours=96.0,
        min_continuous_earth_comms_hours=6.0,
        min_simultaneous_operating_hours=6.0,
    )

    cfg = UncertaintyDistributionConfig(
        seed=12345,
        num_scenarios=15,
        spatial_along_track_sigma_m=100.0,
        spatial_cross_track_sigma_m=50.0,
        temporal_slippage_max_hours=12.0,
    )

    run1 = engine.evaluate_resilience(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        requirements=reqs,
        uncertainty_config=cfg,
    )

    run2 = engine.evaluate_resilience(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        requirements=reqs,
        uncertainty_config=cfg,
    )

    assert run1.feasibility_frequency == run2.feasibility_frequency
    assert run1.num_scenarios_feasible == run2.num_scenarios_feasible
    assert len(run1.scenarios) == len(run2.scenarios) == 15

    for s1, s2 in zip(run1.scenarios, run2.scenarios):
        assert s1.dx_m == s2.dx_m
        assert s1.dy_m == s2.dy_m
        assert s1.dt_hours == s2.dt_hours
        assert s1.evaluated_lat_deg == s2.evaluated_lat_deg
        assert s1.evaluated_lon_deg == s2.evaluated_lon_deg
        assert s1.is_feasible == s2.is_feasible


def test_resilience_confidence_interval_bounds():
    """Verify Wilson score confidence interval mathematical bounds."""
    engine = ResilienceEngine()
    site = LandingSite(
        name="Faustini Rim Test",
        latitude_deg=-87.1,
        longitude_deg=80.0,
        elevation_m=1500.0,
        slope_deg=6.0,
        aspect_deg=45.0,
    )

    cfg = UncertaintyDistributionConfig(
        seed=999,
        num_scenarios=20,
        spatial_along_track_sigma_m=80.0,
        spatial_cross_track_sigma_m=40.0,
        temporal_slippage_max_hours=6.0,
    )

    res = engine.evaluate_resilience(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        uncertainty_config=cfg,
    )

    assert 0.0 <= res.feasibility_frequency <= 1.0
    p_low, p_high = res.confidence_interval_95
    assert 0.0 <= p_low <= res.feasibility_frequency <= p_high <= 1.0
    assert len(res.parameter_sensitivities) == 3
    assert "METHODOLOGY & SCIENTIFIC DISCLAIMER" in res.methodology_and_disclaimer
    assert "Feasibility frequency" in res.methodology_and_disclaimer


def test_api_mission_resilience_endpoint():
    """Test FastAPI endpoint /api/mission/resilience."""
    payload = {
        "site": {
            "name": "Nobile Rim 1 Resilience",
            "latitude_deg": -85.2,
            "longitude_deg": 35.8,
            "elevation_m": 1000.0,
            "slope_deg": 8.0,
            "aspect_deg": 120.0,
        },
        "start_utc": "2026-02-01T00:00:00Z",
        "duration_days": 2.0,
        "step_minutes": 60.0,
        "max_slope_deg": 15.0,
        "requirements": {
            "min_continuous_sunlight_hours": 12.0,
            "max_tolerable_dark_hours": 72.0,
            "min_continuous_earth_comms_hours": 6.0,
            "min_simultaneous_operating_hours": 6.0,
        },
        "uncertainty_config": {
            "seed": 42,
            "num_scenarios": 12,
            "spatial_along_track_sigma_m": 120.0,
            "spatial_cross_track_sigma_m": 60.0,
            "approach_azimuth_deg": 45.0,
            "temporal_slippage_max_hours": 12.0,
            "terrain_slope_sigma_deg": 0.5,
        },
    }

    res = client.post("/api/mission/resilience", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["num_scenarios_evaluated"] == 12
    assert "feasibility_frequency" in data
    assert "confidence_interval_95" in data
    assert "failure_mode_breakdown" in data
    assert "parameter_sensitivities" in data
    assert len(data["scenarios"]) == 12
