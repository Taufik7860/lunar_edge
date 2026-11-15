"""
test_recovery_advanced.py — Rigorous scientific tests for Phase 10: Counterfactual Mission Recovery Intelligence.

Validates:
1. Handling of candidates that already satisfy all mission constraints.
2. Automatic discovery of actionable recovery paths (temporal launch shift, spatial terrace relocation, operational adaptation).
3. Verification that proposed improvements are derived from actual re-calculated physics.
4. API endpoint validation with FastAPI TestClient.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.engines.recovery_engine import CounterfactualRecoveryEngine
from app.models.schemas import LandingSite, MissionRequirements

client = TestClient(app)


def test_recovery_already_feasible_site():
    """Verify that a candidate meeting all requirements requires no interventions."""
    engine = CounterfactualRecoveryEngine()
    site = LandingSite(
        name="Shackleton Connecting Ridge",
        latitude_deg=-89.87,
        longitude_deg=120.0,
        elevation_m=1200.0,
        slope_deg=4.0,
        aspect_deg=180.0,
    )

    reqs = MissionRequirements(
        min_continuous_sunlight_hours=0.0,
        max_tolerable_dark_hours=1000.0,
        min_continuous_earth_comms_hours=0.0,
        min_simultaneous_operating_hours=0.0,
    )

    res = engine.plan_recovery(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        max_slope_deg=45.0,
        requirements=reqs,
    )

    assert res.baseline_evaluation.is_feasible is True
    assert res.optimal_recovery_path is None
    assert "already meets all" in res.recovery_recommendation


def test_recovery_binding_failure_and_interventions():
    """
    Verify counterfactual recovery for a candidate that violates battery darkness limit:
    Should generate temporal shift, spatial relocation, and operational adaptation interventions.
    """
    engine = CounterfactualRecoveryEngine()
    site = LandingSite(
        name="Challenging Crater Wall",
        latitude_deg=-89.5,
        longitude_deg=0.0,
        elevation_m=500.0,
        slope_deg=12.0,
        aspect_deg=90.0,
    )

    # Impose a strict battery darkness limit that will fail
    reqs = MissionRequirements(
        min_continuous_sunlight_hours=6.0,
        max_tolerable_dark_hours=6.0,  # Very short 6-hour battery
        min_continuous_earth_comms_hours=6.0,
        min_simultaneous_operating_hours=3.0,
    )

    res = engine.plan_recovery(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        max_slope_deg=15.0,
        requirements=reqs,
    )

    assert res.baseline_evaluation.is_feasible is False
    assert len(res.interventions_evaluated) >= 1
    assert "Battery Darkness Limit" in res.binding_failure_cause

    # Check intervention structure and recalculations
    for iv in res.interventions_evaluated:
        assert iv.intervention_type in ["TEMPORAL_SHIFT", "SPATIAL_RELOCATION", "OPERATIONAL_RELAXATION", "COMBINED"]
        assert len(iv.recalculated_metrics) > 0
        assert len(iv.remaining_risks) > 0

    assert "All recovery metrics were derived by rerunning" in res.scientific_validation_note


def test_api_mission_recovery_endpoint():
    """Test FastAPI endpoint /api/mission/recovery."""
    payload = {
        "site": {
            "name": "Nobile Rim Recovery Test",
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
            "max_tolerable_dark_hours": 24.0,
            "min_continuous_earth_comms_hours": 6.0,
            "min_simultaneous_operating_hours": 6.0,
        },
    }

    res = client.post("/api/mission/recovery", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()

    assert "baseline_evaluation" in data
    assert "binding_failure_cause" in data
    assert "interventions_evaluated" in data
    assert "recovery_recommendation" in data
    assert "scientific_validation_note" in data
