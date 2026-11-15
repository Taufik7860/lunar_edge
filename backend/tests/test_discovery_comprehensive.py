"""
test_discovery_comprehensive.py — Comprehensive validation for Autonomous Opportunity Discovery Engine.

Validates:
1. Real NASA LOLA 80m DEM elevation, slope, and aspect propagation.
2. Regional terrain roughness metrics (mean, max, std slope, fraction steep > 15°).
3. Realistic 360° terrain horizon integration (mean_horizon_deg > 0°).
4. Four-tier scientific classification (Screening-viable, Conditional, Infeasible, Outside coverage).
5. Explainability traceability with exact numbers, units, and operational mitigations.
6. Region presets and custom bounding box grid probe synthesis.
7. Out-of-coverage boundary enforcement (lat > -80°S).
8. Mathematical monotonicity and normalization of composite scores.
"""

import pytest
from app.engines.discovery_engine import (
    OpportunityDiscoveryEngine,
    OpportunityDiscoveryRequest,
    GeographicBounds,
    CANDIDATE_REGIONS_CATALOG,
)
from app.engines.mission_engine import MissionEngine
from app.models.schemas import MissionRequirements


@pytest.fixture(scope="module")
def mission_engine():
    engine = MissionEngine()
    engine.initialize()
    return engine


@pytest.fixture(scope="module")
def discovery_engine(mission_engine):
    return OpportunityDiscoveryEngine(mission_engine)


def test_real_dem_terrain_integration(discovery_engine):
    """Verify that candidates use authentic LOLA 80m DEM topography."""
    req = OpportunityDiscoveryRequest(
        mission_name="Artemis Terrain Verification",
        target_region="shackleton_connecting_ridge",
        start_utc="2027-02-12T00:00:00Z",
        duration_days=7.0,
        step_minutes=120.0,
    )
    res = discovery_engine.search_and_evaluate(req)

    assert res.total_evaluated == 1
    cand = res.candidates[0]
    assert cand.key == "shackleton_connecting_ridge"

    # Authentic LOLA DEM elevation at Shackleton connecting ridge (-89.70, -129.0)
    assert cand.elevation_m == pytest.approx(674.7, abs=5.0)

    # Real DEM point slope and aspect
    assert cand.slope_deg == pytest.approx(7.26, abs=0.5)
    assert 0.0 <= cand.aspect_deg <= 360.0

    # Regional terrain metrics over 10km radius
    assert cand.regional_slope_mean_deg is not None
    assert cand.regional_slope_mean_deg > 5.0
    assert cand.regional_slope_max_deg is not None
    assert cand.regional_slope_max_deg > cand.regional_slope_mean_deg
    assert cand.fraction_steep_gt_15 is not None
    assert 0.0 <= cand.fraction_steep_gt_15 <= 1.0

    # Real horizon profile
    assert cand.mean_horizon_deg > 2.0  # Ridge has significant surrounding crater topography
    assert cand.mean_horizon_deg < 30.0


def test_four_tier_classification_and_ranking(discovery_engine):
    """Verify that all classification tiers are recognized and ranked correctly."""
    req = OpportunityDiscoveryRequest(
        mission_name="Artemis IV Multi-Site Evaluation",
        target_region="south_pole_all",
        start_utc="2027-02-12T00:00:00Z",
        duration_days=7.0,
        step_minutes=60.0,
        max_slope_deg=10.0,
        requirements=MissionRequirements(
            min_continuous_sunlight_hours=48.0,
            max_tolerable_dark_hours=72.0,
            min_continuous_earth_comms_hours=24.0,
            min_simultaneous_operating_hours=12.0,
        ),
    )
    res = discovery_engine.search_and_evaluate(req)

    assert res.total_evaluated >= 8
    # Validate ordering: Viable first, then Conditional, then Infeasible
    classifications = [c.classification for c in res.candidates]
    rank_order = {"Screening-viable": 0, "Conditional": 1, "Infeasible": 2, "Insufficient data": 3, "Outside coverage": 4}
    ranks = [rank_order.get(c, 5) for c in classifications]
    assert ranks == sorted(ranks), "Candidates must be sorted by scientific viability tier"

    # Check composite score normalization (0 to 100)
    for c in res.candidates:
        assert 0.0 <= c.composite_score <= 100.0


def test_traceable_explainability_content(discovery_engine):
    """Verify explainability output has quantifiable numbers, units, and physical disclaimers."""
    req = OpportunityDiscoveryRequest(
        mission_name="Explainability Audit",
        target_region="shackleton_connecting_ridge",
        start_utc="2027-02-12T00:00:00Z",
        duration_days=7.0,
        step_minutes=120.0,
    )
    res = discovery_engine.search_and_evaluate(req)
    cand = res.candidates[0]
    exp = cand.explanation

    # Must contain explanation text
    assert len(exp.why_this_location) > 20

    # All satisfied and unsatisfied requirements must state numerical values and hours
    all_requirements = exp.satisfied_requirements + exp.unsatisfied_requirements
    assert len(all_requirements) >= 4
    for r in all_requirements:
        assert any(unit in r for unit in ["h", "°", "%"]), f"Requirement text missing physical units: {r}"

    # Favourable and unfavourable factors must contain quantitative context
    all_factors = exp.favourable_factors + exp.unfavourable_factors
    assert len(all_factors) >= 1

    # Must contain the scientific disclaimer regarding DEM resolution
    assert any("LOLA 80m DEM" in risk for risk in exp.identified_risks)


def test_outside_coverage_handling(discovery_engine):
    """Locations north of -80°S must be flagged as 'Outside coverage' with zero scores."""
    out_of_bounds_req = OpportunityDiscoveryRequest(
        mission_name="Equatorial Test",
        target_region="custom_bbox",
        bounds=GeographicBounds(
            lat_min=-75.0,
            lat_max=-70.0,
            lon_min=0.0,
            lon_max=10.0,
        ),
        start_utc="2027-02-12T00:00:00Z",
        duration_days=7.0,
    )
    res = discovery_engine.search_and_evaluate(out_of_bounds_req)

    # Should report outside coverage
    for c in res.candidates:
        assert c.classification == "Outside coverage"
        assert c.composite_score == 0.0
        assert "Outside LOLA 80S DEM" in c.data_coverage_status


def test_custom_bbox_grid_probe_synthesis(discovery_engine):
    """When a custom bounding box contains no predefined catalog sites, probe sites are synthesized."""
    req = OpportunityDiscoveryRequest(
        mission_name="Arbitrary Region Exploration",
        target_region="custom_bbox",
        bounds=GeographicBounds(
            lat_min=-88.0,
            lat_max=-87.0,
            lon_min=140.0,
            lon_max=160.0,
        ),
        start_utc="2027-02-12T00:00:00Z",
        duration_days=5.0,
        step_minutes=120.0,
    )
    res = discovery_engine.search_and_evaluate(req)

    # Should synthesize probe candidates
    assert res.total_evaluated >= 1
    for c in res.candidates:
        assert -88.0 <= c.latitude_deg <= -87.0
        assert 140.0 <= c.longitude_deg <= 160.0
        assert len(c.boundary_polygon) >= 4
        assert c.classification in ["Screening-viable", "Conditional", "Infeasible"]


def test_deep_polar_filter(discovery_engine):
    """Test deep polar preset filter (lat <= -87°S)."""
    req = OpportunityDiscoveryRequest(
        mission_name="Deep Polar Survey",
        target_region="deep_polar",
        start_utc="2027-02-12T00:00:00Z",
        duration_days=5.0,
        step_minutes=120.0,
    )
    res = discovery_engine.search_and_evaluate(req)

    for c in res.candidates:
        assert c.latitude_deg <= -87.0
