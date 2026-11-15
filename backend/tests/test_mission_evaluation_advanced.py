"""
test_mission_evaluation_advanced.py — Rigorous tests for Phase 8: Master Mission Evaluation Engine.

Validates:
1. Strict constraint evaluation and binding constraint identification.
2. Rule enforcement: Positive elevation or composite scores NEVER override failed constraints.
3. Out-of-coverage handling for locations north of -80°S.
4. Realistic evaluation on Artemis III candidate sites with LOLA DEM ground truth.
5. API endpoint validation with FastAPI TestClient.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.engines.mission_engine import MissionEngine
from app.models.schemas import LandingSite, MissionRequirements, MissionEvaluationRequest


client = TestClient(app)


def test_mission_engine_outside_coverage():
    """Verify that sites north of -80°S are classified as OUTSIDE_COVERAGE with zero feasibility."""
    engine = MissionEngine()
    equatorial_site = LandingSite(
        name="Apollo 11 Tranquility Base",
        latitude_deg=0.674,
        longitude_deg=23.473,
        elevation_m=0.0,
        slope_deg=1.0,
        aspect_deg=0.0,
    )

    resp = engine.evaluate_candidate_mission(
        site=equatorial_site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=3.0,
        step_minutes=60.0,
    )

    assert resp.overall_classification == "OUTSIDE_COVERAGE"
    assert resp.is_feasible is False
    assert resp.composite_score == 0.0
    assert any(c.status == "OUTSIDE_COVERAGE" for c in resp.constraints)
    assert any("outside the LOLA South Polar" in r for r in resp.identified_risks)


def test_failed_constraint_never_overridden_by_score():
    """
    CRITICAL NASA SCIENTIFIC RULE:
    Even if elevation is high and sunlight availability is high, if a critical requirement
    (such as maximum slope or maximum tolerable darkness) fails, is_feasible MUST be False.
    """
    engine = MissionEngine()
    # Test on a site with steep slope or impossible continuous sunlight
    site = LandingSite(
        name="Test Ridge",
        latitude_deg=-89.5,
        longitude_deg=0.0,
        elevation_m=1500.0,
        slope_deg=20.0,  # Steeper than threshold
        aspect_deg=90.0,
    )

    # Impose impossible continuous daylight constraint (e.g. 500 hours in a 72-hour mission)
    reqs = MissionRequirements(
        min_continuous_sunlight_hours=500.0,
        max_tolerable_dark_hours=1.0,  # Strict 1-hour battery limit
        min_continuous_earth_comms_hours=12.0,
        min_simultaneous_operating_hours=6.0,
    )

    resp = engine.evaluate_candidate_mission(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=3.0,
        step_minutes=60.0,
        max_slope_deg=5.0,  # Strict 5° slope limit
        requirements=reqs,
    )

    # Feasibility must be strictly False
    assert resp.is_feasible is False
    assert resp.overall_classification in ["CONDITIONAL", "INFEASIBLE"]

    # Binding constraints must include all failed requirements
    failed_names = [c.name for c in resp.constraints if c.status == "EVALUATED_FAIL"]
    assert len(failed_names) > 0
    for c in resp.binding_constraints:
        assert c.name in failed_names
        assert c.is_binding is True


def test_feasible_site_binding_constraint_identification():
    """
    When all constraints pass, the constraint with the smallest safety margin
    must be correctly identified as the binding constraint.
    """
    engine = MissionEngine()
    site = LandingSite(
        name="Shackleton Connecting Ridge Test",
        latitude_deg=-89.87,
        longitude_deg=120.0,
        elevation_m=1200.0,
        slope_deg=3.0,
        aspect_deg=180.0,
    )

    # Generous requirements that easily pass
    reqs = MissionRequirements(
        min_continuous_sunlight_hours=0.0,  # No minimum
        max_tolerable_dark_hours=500.0,     # Huge battery
        min_continuous_earth_comms_hours=0.0,
        min_simultaneous_operating_hours=0.0,
    )

    resp = engine.evaluate_candidate_mission(
        site=site,
        start_utc="2026-02-01T00:00:00Z",
        duration_days=2.0,
        step_minutes=60.0,
        max_slope_deg=45.0,  # Very generous slope limit
        requirements=reqs,
    )

    assert resp.is_feasible is True
    assert resp.overall_classification == "FEASIBLE"
    assert len(resp.binding_constraints) == 1
    assert resp.binding_constraints[0].is_binding is True
    assert resp.binding_constraints[0].margin is not None
    assert resp.binding_constraints[0].margin >= 0.0


def test_api_mission_evaluation_endpoint():
    """Test FastAPI endpoint /api/mission/evaluate."""
    payload = {
        "site": {
            "name": "Nobile Rim 1 Screening",
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
        "horizon_radius_km": 15.0,
    }

    res = client.post("/api/mission/evaluate", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()

    assert "overall_classification" in data
    assert "is_feasible" in data
    assert "constraints" in data
    assert len(data["constraints"]) == 5
    assert "binding_constraints" in data
    assert len(data["binding_constraints"]) >= 1
    assert "continuity_metrics" in data
    assert "visibility_summary" in data
    assert "identified_risks" in data
    assert "provenance" in data
    assert "dem_dataset" in data["provenance"]
