"""
main.py — LUNAR EDGE FastAPI Application

NASA Space Apps Challenge 2026: Lunar Landing Site Navigator
Mission Opportunity and Constraint Analysis System.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from app.utils.date_utils import validate_iso_utc_string

from app.engines.geometry_engine import GeometryEngine, CANDIDATE_LANDING_SITES
from app.engines.mission_engine import MissionEngine
from app.engines.terrain_engine import TerrainEngine, DEM_DEFAULT_PATH
from app.models.schemas import (
    LandingSite,
    EpochGeometry,
    TimeSeriesSample,
    GeometryTimeSeriesRequest,
    HorizonRequest,
    HorizonProfile,
    VisibilityTimeSeriesResponse,
    ContinuityEnvelopeResult,
    MissionRequirements,
    MissionEvaluationRequest,
    MissionEvaluationResponse,
    ProbabilisticResilienceRequest,
    ProbabilisticResilienceResponse,
    CounterfactualRecoveryRequest,
    CounterfactualRecoveryResponse,
)
from app.services.spice_service import SPICEService, REQUIRED_KERNELS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("lunar_edge")

# ---------------------------------------------------------------------------
# Global Singleton Engine
# ---------------------------------------------------------------------------

mission_engine: Optional[MissionEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes SPICE kernels and DEM data upon FastAPI startup."""
    global mission_engine
    logger.info("Initializing LUNAR EDGE Core Engines...")
    try:
        SPICEService().load_kernels()
        logger.info("SPICE kernels loaded and verified.")
    except Exception as e:
        logger.error("Failed to load SPICE kernels: %s", e)

    mission_engine = MissionEngine()
    mission_engine.initialize()
    logger.info("LUNAR EDGE Ready for Mission Planning.")
    yield
    logger.info("Shutting down LUNAR EDGE...")


app = FastAPI(
    title="LUNAR EDGE API",
    description="Terrain-aware Lunar Landing Mission Opportunity & Robustness Analysis System",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request Schemas for API Endpoints
# ---------------------------------------------------------------------------

class EpochGeometryRequest(BaseModel):
    site: LandingSite
    utc: str = Field(..., description="UTC ISO timestamp, e.g. '2026-02-01T12:00:00Z'")

    @field_validator("utc", mode="before")
    @classmethod
    def validate_utc(cls, v: str) -> str:
        return validate_iso_utc_string(str(v))


class ElevationRequest(BaseModel):
    latitude_deg: float = Field(..., ge=-90.0, le=90.0)
    longitude_deg: float = Field(..., ge=-180.0, le=360.0)


class ElevationResponse(BaseModel):
    latitude_deg: float
    longitude_deg: float
    elevation_m: float
    polar_stereo_x_m: float
    polar_stereo_y_m: float


class VisibilityEvaluationRequest(BaseModel):
    site: LandingSite
    start_utc: str = Field(..., description="Start epoch ISO format, e.g. '2026-02-01T00:00:00Z'")
    duration_days: float = Field(14.0, gt=0.0, le=180.0)
    step_minutes: float = Field(15.0, gt=0.0, le=1440.0)
    horizon_radius_km: float = Field(20.0, gt=1.0, le=100.0)

    @field_validator("start_utc", mode="before")
    @classmethod
    def validate_start_utc(cls, v: str) -> str:
        return validate_iso_utc_string(str(v))


class ContinuityEnvelopeRequest(BaseModel):
    site: LandingSite
    start_utc: str = Field(..., description="Nominal start epoch ISO format, e.g. '2026-02-01T00:00:00Z'")
    duration_days: float = Field(14.0, gt=0.0, le=60.0)
    step_minutes: float = Field(30.0, gt=5.0, le=1440.0)
    requirements: Optional[MissionRequirements] = None

    @field_validator("start_utc", mode="before")
    @classmethod
    def validate_start_utc(cls, v: str) -> str:
        return validate_iso_utc_string(str(v))


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

def get_mission_engine() -> MissionEngine:
    """Ensure mission engine is initialized and returned."""
    global mission_engine
    if mission_engine is None:
        SPICEService().load_kernels()
        mission_engine = MissionEngine()
        mission_engine.initialize()
    return mission_engine


@app.get("/api/health")
def get_system_health():
    """Returns status of SPICE kernels, DEM, and computational engines."""
    spice = SPICEService()
    dem_available = DEM_DEFAULT_PATH.exists()
    return {
        "status": "healthy",
        "spice_kernels_loaded": spice._kernels_loaded,
        "spice_kernel_count": len(REQUIRED_KERNELS),
        "dem_file_exists": dem_available,
        "dem_path": str(DEM_DEFAULT_PATH),
        "candidate_sites_count": len(CANDIDATE_LANDING_SITES),
    }


@app.get("/api/sites", response_model=Dict[str, LandingSite])
def list_candidate_sites():
    """List Artemis III pre-configured lunar south pole candidate landing sites."""
    return CANDIDATE_LANDING_SITES


@app.post("/api/geometry/epoch", response_model=EpochGeometry)
def get_epoch_geometry(req: EpochGeometryRequest):
    """Calculate instantaneous topocentric Sun and Earth geometry at single epoch."""
    engine = get_mission_engine()
    try:
        return engine.geometry_engine.compute_epoch_geometry(
            site=req.site,
            utc_str=req.utc,
        )
    except Exception as e:
        logger.error("Epoch calculation failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/geometry/timeseries")
def get_geometry_timeseries(req: GeometryTimeSeriesRequest):
    """Calculate geometric Sun and Earth ephemeris time-series over a mission duration."""
    engine = get_mission_engine()
    try:
        samples, summary = engine.geometry_engine.compute_mission_window_time_series(
            site=req.site,
            start_utc=req.start_utc,
            duration_days=req.duration_days,
            step_minutes=req.step_minutes,
        )
        return {
            "summary": summary,
            "samples": samples,
        }
    except Exception as e:
        logger.error("Timeseries calculation failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/terrain/elevation", response_model=ElevationResponse)
def get_point_elevation(req: ElevationRequest):
    """Query bilinearly-interpolated surface elevation from LOLA DEM."""
    engine = get_mission_engine()
    try:
        elev = engine.terrain_engine.get_elevation(req.latitude_deg, req.longitude_deg)
        x_m, y_m = engine.terrain_engine.selenographic_to_polar_stereo(req.latitude_deg, req.longitude_deg)
        return ElevationResponse(
            latitude_deg=req.latitude_deg,
            longitude_deg=req.longitude_deg,
            elevation_m=round(elev, 2),
            polar_stereo_x_m=round(x_m, 2),
            polar_stereo_y_m=round(y_m, 2),
        )
    except Exception as e:
        logger.error("Elevation lookup failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/terrain/horizon", response_model=HorizonProfile)
def get_terrain_horizon(req: HorizonRequest):
    """Calculate 360° terrain horizon obstruction profile from LOLA DEM."""
    engine = get_mission_engine()
    try:
        return engine.compute_horizon(
            site=req.site,
            radius_km=req.radius_km,
            n_azimuths=req.n_azimuths,
        )
    except Exception as e:
        logger.error("Horizon calculation failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/visibility/evaluate", response_model=VisibilityTimeSeriesResponse)
def evaluate_terrain_visibility(req: VisibilityEvaluationRequest):
    """
    Perform full terrain-aware visibility analysis:
    Combines ephemeris with terrain obstruction, solar disc occultation,
    and direct-to-Earth communication line of sight.
    """
    engine = get_mission_engine()
    try:
        return engine.evaluate_mission_visibility(
            site=req.site,
            start_utc=req.start_utc,
            duration_days=req.duration_days,
            step_minutes=req.step_minutes,
            horizon_radius_km=req.horizon_radius_km,
        )
    except Exception as e:
        logger.error("Visibility evaluation failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/continuity/envelope", response_model=ContinuityEnvelopeResult)
def evaluate_continuity_envelope(req: ContinuityEnvelopeRequest):
    """
    Mission Continuity Envelope:
    Deterministic sensitivity analysis for landing location dispersion (±250m)
    and launch/landing date slippage (±days) against mission requirements.
    """
    engine = get_mission_engine()
    try:
        return engine.evaluate_continuity_envelope(
            site=req.site,
            start_utc=req.start_utc,
            duration_days=req.duration_days,
            step_minutes=req.step_minutes,
            requirements=req.requirements,
        )
    except Exception as e:
        logger.error("Continuity envelope evaluation failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/mission/evaluate", response_model=MissionEvaluationResponse)
def evaluate_candidate_mission(req: MissionEvaluationRequest):
    """
    Master Mission Evaluation:
    Evaluates candidate site across all mission constraints (slope, continuous daylight,
    tolerable darkness, Earth comms, simultaneous ops). Returns binding constraints,
    risks, recommendations, and defensible rule-based classification.
    """
    engine = get_mission_engine()
    try:
        return engine.evaluate_candidate_mission(
            site=req.site,
            start_utc=req.start_utc,
            duration_days=req.duration_days,
            step_minutes=req.step_minutes,
            max_slope_deg=req.max_slope_deg,
            requirements=req.requirements,
            horizon_radius_km=req.horizon_radius_km,
        )
    except Exception as e:
        logger.error("Mission evaluation failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/mission/resilience", response_model=ProbabilisticResilienceResponse)
def evaluate_probabilistic_resilience(req: ProbabilisticResilienceRequest):
    """
    Probabilistic Mission Resilience:
    Repeatable Monte Carlo simulation modeling touchdown dispersion ellipses,
    launch epoch variations, and terrain slope measurement uncertainty.
    """
    engine = get_mission_engine()
    try:
        return engine.evaluate_probabilistic_resilience(
            site=req.site,
            start_utc=req.start_utc,
            duration_days=req.duration_days,
            step_minutes=req.step_minutes,
            max_slope_deg=req.max_slope_deg,
            requirements=req.requirements,
            uncertainty_config=req.uncertainty_config,
        )
    except Exception as e:
        logger.error("Probabilistic resilience evaluation failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/mission/recovery", response_model=CounterfactualRecoveryResponse)
def plan_counterfactual_recovery(req: CounterfactualRecoveryRequest):
    """
    Counterfactual Mission Recovery Intelligence:
    Identifies binding failure causes and generates verified actionable interventions
    (temporal launch window shift, spatial terrace relocation, and operational adaptation).
    """
    engine = get_mission_engine()
    try:
        return engine.plan_counterfactual_recovery(
            site=req.site,
            start_utc=req.start_utc,
            duration_days=req.duration_days,
            step_minutes=req.step_minutes,
            max_slope_deg=req.max_slope_deg,
            requirements=req.requirements,
        )
    except Exception as e:
        logger.error("Counterfactual recovery planning failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/discovery/search")
def discover_landing_opportunities(req: dict):
    """
    Autonomous Opportunity Discovery:
    Evaluates south polar candidate landing regions across terrain, SPICE ephemerides,
    and mission constraints. Returns spatial boundaries, rankings, and explainable recommendations.
    """
    from app.engines.discovery_engine import OpportunityDiscoveryEngine, OpportunityDiscoveryRequest
    engine = get_mission_engine()
    try:
        parsed_req = OpportunityDiscoveryRequest(**req)
        discovery_engine = OpportunityDiscoveryEngine(engine)
        return discovery_engine.search_and_evaluate(parsed_req)
    except Exception as e:
        logger.error("Opportunity discovery failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
