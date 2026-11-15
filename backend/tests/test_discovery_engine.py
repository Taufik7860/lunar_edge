"""
test_discovery_engine.py — Tests for Autonomous Opportunity Discovery Engine
"""

import pytest
from app.engines.discovery_engine import (
    OpportunityDiscoveryEngine,
    OpportunityDiscoveryRequest,
    GeographicBounds,
)
from app.engines.mission_engine import MissionEngine
from app.models.schemas import MissionRequirements


@pytest.fixture(scope="module")
def mission_engine():
    engine = MissionEngine()
    engine.initialize()
    return engine


def test_discovery_engine_evaluation(mission_engine):
    discovery_engine = OpportunityDiscoveryEngine(mission_engine)
    req = OpportunityDiscoveryRequest(
        mission_name="Test Polar Mission",
        target_region="south_pole_all",
        start_utc="2026-01-15T00:00:00Z",
        duration_days=7.0,
        step_minutes=60.0,
        requirements=MissionRequirements(
            min_continuous_sunlight_hours=48.0,
            max_tolerable_dark_hours=72.0,
            min_continuous_earth_comms_hours=0.0,
            min_simultaneous_operating_hours=0.0,
        ),
    )
    res = discovery_engine.search_and_evaluate(req)

    assert res.total_evaluated >= 8
    assert len(res.candidates) >= 8
    assert res.viable_count >= 1

    # Check top candidate structure
    top = res.candidates[0]
    assert top.classification in ["Screening-viable", "Conditional", "Infeasible"]
    assert len(top.boundary_polygon) >= 4
    assert top.composite_score >= 0.0
    assert "why_this_location" in top.explanation.model_dump()
    assert len(top.explanation.identified_risks) > 0


def test_discovery_engine_bounds_filter(mission_engine):
    discovery_engine = OpportunityDiscoveryEngine(mission_engine)
    # Search bounded tightly around Shackleton connecting ridge: -90 to -89 lat, -140 to -120 lon
    req = OpportunityDiscoveryRequest(
        mission_name="Targeted Search",
        target_region="custom_bbox",
        bounds=GeographicBounds(
            lat_min=-90.0,
            lat_max=-89.0,
            lon_min=-140.0,
            lon_max=-120.0,
        ),
        start_utc="2026-07-01T00:00:00Z",
        duration_days=7.0,
        step_minutes=120.0,
    )
    res = discovery_engine.search_and_evaluate(req)
    assert res.total_evaluated == 1
    assert res.candidates[0].key == "shackleton_connecting_ridge"
