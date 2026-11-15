import os
import sys

sys.path.insert(0, os.path.abspath("."))

from app.engines.terrain_engine import TerrainEngine
from app.engines.geometry_engine import GeometryEngine
from app.engines.mission_engine import MissionEngine
from app.models.schemas import LandingSite
from app.engines.discovery_engine import OpportunityDiscoveryEngine, OpportunityDiscoveryRequest, GeographicBounds

me = MissionEngine()
me.initialize()
de = OpportunityDiscoveryEngine(me)

print("--- Running Discovery Search ---")
req = OpportunityDiscoveryRequest(
    mission_name="Artemis IV",
    target_region="south_pole_all",
    start_utc="2026-07-01T00:00:00Z",
    duration_days=14.0,
    step_minutes=60.0
)
res = de.search_and_evaluate(req)
for c in res.candidates:
    print(f"Candidate: {c.name}")
    print(f"  Classification: {c.classification}")
    print(f"  Sunlight: {c.sunlight_percentage}% ({c.sunlit_hours}h)")
    print(f"  Longest Dark: {c.longest_dark_period_hours}h")
    print(f"  Longest Comms: {c.longest_comms_window_hours}h")
    print(f"  Composite Score: {c.composite_score}")
    print(f"  Constraints Assessment: {c.constraints_assessment}")
    print(f"  Why: {c.explanation.why_this_location}")
    print(f"  Unsatisfied: {c.explanation.unsatisfied_requirements}")
    print()
