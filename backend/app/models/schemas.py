"""
LUNAR EDGE — Pydantic Data Models & Schemas
Defines request and response structures for scientific calculations.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator
from app.utils.date_utils import validate_iso_utc_string


class LandingSite(BaseModel):
    """Lunar Landing Site definition."""
    name: str = Field(..., description="Descriptive name of the landing site")
    latitude_deg: float = Field(..., ge=-90.0, le=90.0, description="Selenographic latitude (deg, South negative)")
    longitude_deg: float = Field(..., ge=-180.0, le=360.0, description="Selenographic longitude (deg, East positive)")
    elevation_m: float = Field(0.0, description="Elevation above IAU Moon 2000 reference sphere in metres")
    slope_deg: float = Field(0.0, ge=0.0, le=90.0, description="Local terrain slope in degrees")
    aspect_deg: float = Field(0.0, ge=0.0, le=360.0, description="Direction slope dips, clockwise from North")


class BodyGeometry(BaseModel):
    """Topocentric celestial body position and apparent size."""
    body: str
    azimuth_deg: float = Field(..., description="Azimuth angle (0-360°, clockwise from North)")
    elevation_deg: float = Field(..., description="Geometric elevation above local horizon plane in degrees")
    distance_km: float = Field(..., description="Distance in kilometres")
    angular_radius_deg: float = Field(..., description="Apparent angular semi-diameter in degrees")
    angular_diameter_deg: float = Field(..., description="Apparent angular diameter in degrees")
    light_time_s: float = Field(..., description="One-way light time in seconds")
    sub_lat_deg: Optional[float] = Field(None, description="Sub-body latitude on Moon in degrees (South negative)")
    sub_lon_deg: Optional[float] = Field(None, description="Sub-body longitude on Moon in degrees (East positive)")


class SolarIncidence(BaseModel):
    """Solar illumination geometry on local surface."""
    zenith_angle_deg: float
    incidence_angle_deg: float
    cosine_incidence: float
    is_above_geometric_horizon: bool
    is_surface_illuminated: bool


class EpochGeometry(BaseModel):
    """Simultaneous Sun and Earth geometry at an epoch."""
    et: float
    utc: str
    sun: BodyGeometry
    earth: BodyGeometry
    solar_incidence: SolarIncidence


class TimeSeriesSample(BaseModel):
    """Single sample in a mission geometry time-series."""
    et: float
    utc: str
    sun_azimuth_deg: float
    sun_elevation_deg: float
    sun_distance_km: float
    sun_angular_radius_deg: float
    sun_angular_diameter_deg: float
    earth_azimuth_deg: float
    earth_elevation_deg: float
    earth_distance_km: float
    earth_angular_radius_deg: float
    earth_angular_diameter_deg: float
    solar_incidence_angle_deg: float
    solar_cosine_incidence: float
    is_sun_above_geometric_horizon: bool
    is_sun_disc_partially_above_geometric_horizon: bool
    is_earth_above_geometric_horizon: bool
    is_earth_disc_partially_above_geometric_horizon: bool


class GeometryTimeSeriesRequest(BaseModel):
    """Request for mission window geometry calculation."""
    site: LandingSite
    start_utc: str = Field(..., description="Start epoch (ISO format, e.g. '2026-01-15T00:00:00Z')")
    duration_days: float = Field(14.0, gt=0.0, le=180.0, description="Mission duration in days")
    step_minutes: float = Field(15.0, gt=0.0, le=1440.0, description="Sampling time step in minutes")

    @field_validator("start_utc", mode="before")
    @classmethod
    def validate_start_utc(cls, v: Any) -> str:
        return validate_iso_utc_string(str(v))


class GeometrySummary(BaseModel):
    """High-level summary of geometric conditions across an analysis window."""
    total_samples: int
    duration_days: float
    sun_min_elevation_deg: float
    sun_max_elevation_deg: float
    sun_mean_elevation_deg: float
    geometric_daylight_fraction: float = Field(..., description="Fraction of time Sun center is above spherical horizon")
    geometric_partial_daylight_fraction: float = Field(..., description="Fraction of time any part of Sun disc is above spherical horizon")
    earth_min_elevation_deg: float
    earth_max_elevation_deg: float
    earth_mean_elevation_deg: float
    geometric_earth_visibility_fraction: float = Field(..., description="Fraction of time Earth is geometrically above spherical horizon")
    libration_elevation_range_deg: float = Field(..., description="Variation in Earth elevation due to lunar libration")
    note: str = "Calculations reflect geometric line-of-sight to reference sphere. Terrain obstruction requires Module C."


# ---------------------------------------------------------------------------
# Terrain & Horizon Schemas
# ---------------------------------------------------------------------------

class HorizonRequest(BaseModel):
    site: LandingSite
    radius_km: float = Field(20.0, gt=1.0, le=100.0, description="Horizon calculation radius in km")
    n_azimuths: int = Field(360, ge=72, le=1440, description="Number of azimuth ray samples (e.g. 360 for 1° resolution)")


class HorizonProfile(BaseModel):
    site: LandingSite
    azimuths_deg: List[float]
    horizon_elevations_deg: List[float]
    min_horizon_deg: float
    max_horizon_deg: float
    mean_horizon_deg: float
    observer_elevation_m: float
    radius_km: float


# ---------------------------------------------------------------------------
# Terrain-Aware Visibility Schemas
# ---------------------------------------------------------------------------

class VisibilitySample(BaseModel):
    et: float
    utc: str
    sun_azimuth_deg: float
    sun_elevation_deg: float
    sun_angular_radius_deg: float
    sun_horizon_elevation_deg: float
    sun_clearance_deg: float
    sun_illumination_fraction: float = Field(..., description="0.0 = dark, 1.0 = full sun, 0.0-1.0 = partial/limb")
    is_sunlit: bool
    is_sun_partial: bool
    
    earth_azimuth_deg: float
    earth_elevation_deg: float
    earth_angular_radius_deg: float
    earth_horizon_elevation_deg: float
    earth_clearance_deg: float
    is_earth_visible: bool
    earth_visible_fraction: Optional[float] = Field(None, description="Fraction [0.0, 1.0] of Earth disc visible above terrain")
    
    is_simultaneous_operating: bool = Field(..., description="Both power (sunlit) and direct line-of-sight comms available")


class MissionInterval(BaseModel):
    type: str = Field(..., description="'SUNLIT', 'PARTIAL', 'DARK', 'EARTH_VISIBLE', 'EARTH_BLOCKED', 'SIMULTANEOUS'")
    start_utc: str
    end_utc: str
    duration_hours: float


class VisibilitySummary(BaseModel):
    site_name: str
    start_utc: str
    duration_days: float
    step_minutes: float
    total_samples: int
    
    sunlit_hours: float
    partial_hours: float
    dark_hours: float
    sunlit_fraction: float
    longest_sunlit_window_hours: float
    longest_dark_period_hours: float
    
    earth_visible_hours: float
    earth_visible_fraction: float
    longest_earth_visible_window_hours: float
    longest_earth_blackout_hours: float
    
    simultaneous_hours: float
    simultaneous_fraction: float
    longest_simultaneous_window_hours: float
    
    intervals: List[MissionInterval]


class VisibilityTimeSeriesResponse(BaseModel):
    summary: VisibilitySummary
    samples: List[VisibilitySample]


# ---------------------------------------------------------------------------
# Mission Continuity Envelope Schemas
# ---------------------------------------------------------------------------

class MissionRequirements(BaseModel):
    """Mission success criteria for decision support."""
    min_continuous_sunlight_hours: float = Field(72.0, description="Minimum continuous power window needed")
    max_tolerable_dark_hours: float = Field(48.0, description="Maximum tolerable continuous darkness (battery limit)")
    min_continuous_earth_comms_hours: float = Field(24.0, description="Minimum continuous direct comms window")
    min_simultaneous_operating_hours: float = Field(24.0, description="Minimum simultaneous power + comms window")


class PerturbedEvaluation(BaseModel):
    displacement_dx_m: float = Field(..., description="East-West spatial offset in metres")
    displacement_dy_m: float = Field(..., description="North-South spatial offset in metres")
    displacement_distance_m: float = Field(..., description="Total landing dispersion distance in metres")
    date_slippage_days: float = Field(..., description="Date launch/landing slippage in days")
    evaluated_lat_deg: float
    evaluated_lon_deg: float
    evaluated_start_utc: str
    
    sunlit_hours: float
    sunlit_fraction: float
    longest_sunlit_window_hours: float
    longest_dark_period_hours: float
    longest_comms_window_hours: float
    longest_simultaneous_hours: float
    
    meets_requirements: bool
    failure_reasons: List[str]


class ContinuityEnvelopeResult(BaseModel):
    baseline_site: LandingSite
    baseline_summary: VisibilitySummary
    requirements: MissionRequirements
    baseline_meets_requirements: bool
    baseline_failure_reasons: List[str]
    
    perturbations: List[PerturbedEvaluation]
    spatial_success_rate: float = Field(..., description="Fraction of spatial dispersion points passing requirements")
    temporal_success_rate: float = Field(..., description="Fraction of launch slippage dates passing requirements")
    overall_robustness_score: float = Field(..., ge=0.0, le=1.0, description="Composite envelope robustness score [0, 1]")
    baseline_continuity_metrics: Optional["ContinuityMetrics"] = None


class ContinuityMetrics(BaseModel):
    """
    Detailed continuity and window metrics derived from time-series visibility analysis.
    Explicitly distinguishes cumulative totals from contiguous duration windows.
    """
    site_name: str
    start_utc: str
    duration_days: float
    step_minutes: float
    total_mission_hours: float
    temporal_uncertainty_hours: float = Field(
        ...,
        description="Quantization uncertainty bound on interval durations (+/- dt)",
    )
    
    # Illumination metrics
    total_sunlight_hours: float = Field(..., description="Cumulative hours with illumination")
    sunlight_availability_pct: float = Field(..., description="Percentage of mission time sunlit [0-100%]")
    longest_continuous_illumination_hours: float = Field(..., description="Longest unbroken sunlit window")
    longest_continuous_darkness_hours: float = Field(..., description="Longest unbroken darkness period")
    
    # Earth Communication metrics
    total_earth_visibility_hours: float = Field(..., description="Cumulative hours with direct Earth LOS")
    earth_visibility_pct: float = Field(..., description="Percentage of mission time with direct Earth LOS [0-100%]")
    longest_continuous_earth_visibility_hours: float = Field(..., description="Longest unbroken Earth LOS window")
    longest_continuous_earth_blackout_hours: float = Field(..., description="Longest unbroken Earth blackout period")
    
    # Simultaneous Power + Comms
    total_simultaneous_hours: float = Field(..., description="Cumulative hours with both sunlit and Earth LOS")
    simultaneous_availability_pct: float = Field(..., description="Percentage of mission time with simultaneous power and comms")
    longest_continuous_simultaneous_hours: float = Field(..., description="Longest unbroken simultaneous window")
    
    # State transitions
    day_to_night_transitions: int = Field(..., description="Number of transitions from sunlit to darkness")
    night_to_day_transitions: int = Field(..., description="Number of transitions from darkness to sunlit")
    comms_acquired_transitions: int = Field(..., description="Number of times Earth LOS was acquired")
    comms_lost_transitions: int = Field(..., description="Number of times Earth LOS was lost")
    simultaneous_acquired_transitions: int = Field(..., description="Number of times simultaneous conditions were acquired")
    simultaneous_lost_transitions: int = Field(..., description="Number of times simultaneous conditions were lost")
    
    explanation: str = Field(..., description="Scientific explanation of continuity findings and sampling accuracy limits")


# ---------------------------------------------------------------------------
# Phase 8 — Master Mission Evaluation Schemas
# ---------------------------------------------------------------------------

class ConstraintEvaluation(BaseModel):
    """Evaluation result for a single mission operational or terrain constraint."""
    name: str = Field(..., description="Short name of the constraint")
    description: str = Field(..., description="Operational explanation")
    operator: str = Field(..., description="'<=' or '>='")
    threshold: float = Field(..., description="Mission threshold value")
    actual_value: Optional[float] = Field(None, description="Actual calculated scientific value")
    unit: str = Field(..., description="Engineering units, e.g. 'deg', 'hours'")
    margin: Optional[float] = Field(None, description="Signed margin relative to threshold (positive = passing headroom)")
    status: str = Field(..., description="'EVALUATED_PASS', 'EVALUATED_FAIL', 'UNEVALUATED', 'OUTSIDE_COVERAGE'")
    is_binding: bool = Field(False, description="True if constraint caused mission failure or has smallest passing margin")


class MissionEvaluationRequest(BaseModel):
    """Request for comprehensive multi-engine mission feasibility evaluation."""
    site: LandingSite
    start_utc: str = Field(..., description="Mission start epoch (ISO-8601 UTC)")
    duration_days: float = Field(14.0, gt=0.0, le=180.0, description="Mission duration in Earth days")
    step_minutes: float = Field(15.0, gt=0.0, le=1440.0, description="Ephemeris time step in minutes")
    max_slope_deg: float = Field(15.0, ge=0.0, le=45.0, description="Maximum permitted lander slope in degrees")
    requirements: Optional[MissionRequirements] = None
    horizon_radius_km: float = Field(20.0, gt=1.0, le=100.0, description="Horizon ray-cast radius in km")

    @field_validator("start_utc", mode="before")
    @classmethod
    def validate_start_utc(cls, v: Any) -> str:
        return validate_iso_utc_string(str(v))


class MissionEvaluationResponse(BaseModel):
    """Complete scientific mission evaluation response integrating all computational engines."""
    site: LandingSite
    start_utc: str
    duration_days: float
    step_minutes: float
    overall_classification: str = Field(..., description="'FEASIBLE', 'CONDITIONAL', 'INFEASIBLE', 'OUTSIDE_COVERAGE'")
    is_feasible: bool = Field(..., description="Strict boolean feasibility based on evaluated constraints (never overridden by score)")
    composite_score: float = Field(..., ge=0.0, le=100.0, description="Normalized suitability score [0-100]")
    constraints: List[ConstraintEvaluation]
    binding_constraints: List[ConstraintEvaluation]
    continuity_metrics: ContinuityMetrics
    visibility_summary: VisibilitySummary
    identified_risks: List[str]
    recommendation: str
    data_completeness: str
    provenance: Dict[str, Any]


# ---------------------------------------------------------------------------
# Phase 9 — Probabilistic Mission Resilience Schemas
# ---------------------------------------------------------------------------

class UncertaintyDistributionConfig(BaseModel):
    """Configuration for repeatable Monte Carlo landing dispersion and operational uncertainty."""
    seed: int = Field(42, description="Random seed for repeatable Monte Carlo sampling")
    num_scenarios: int = Field(50, ge=10, le=500, description="Number of Monte Carlo scenarios to simulate")
    spatial_along_track_sigma_m: float = Field(150.0, ge=10.0, le=1000.0, description="1-sigma along-track landing dispersion in metres")
    spatial_cross_track_sigma_m: float = Field(75.0, ge=10.0, le=500.0, description="1-sigma cross-track landing dispersion in metres")
    approach_azimuth_deg: float = Field(0.0, ge=0.0, le=360.0, description="Lander approach corridor azimuth clockwise from North")
    temporal_slippage_max_hours: float = Field(24.0, ge=0.0, le=168.0, description="Maximum launch/landing epoch slippage in hours (+/-)")
    terrain_slope_sigma_deg: float = Field(0.5, ge=0.0, le=5.0, description="Measurement noise standard deviation on DEM slopes")


class ResilienceScenarioResult(BaseModel):
    """Single evaluated Monte Carlo scenario under uncertainty."""
    scenario_id: int
    dx_m: float = Field(..., description="Topocentric East-West spatial displacement in metres")
    dy_m: float = Field(..., description="Topocentric North-South spatial displacement in metres")
    radial_dispersion_m: float = Field(..., description="Total radial landing error in metres")
    dt_hours: float = Field(..., description="Landing epoch offset in hours")
    evaluated_lat_deg: float
    evaluated_lon_deg: float
    evaluated_slope_deg: float
    longest_sunlit_window_hours: float
    longest_dark_period_hours: float
    longest_earth_window_hours: float
    is_feasible: bool
    failed_constraints: List[str]


class ParameterSensitivity(BaseModel):
    """Sensitivity analysis metric evaluating impact of uncertain parameter on mission success."""
    parameter_name: str
    correlation_with_margin: float = Field(..., description="Correlation between parameter perturbation and binding margin")
    impact_rating: str = Field(..., description="'HIGH', 'MEDIUM', 'LOW'")
    explanation: str


class ProbabilisticResilienceRequest(BaseModel):
    """Request for Monte Carlo mission resilience evaluation under landing and epoch uncertainty."""
    site: LandingSite
    start_utc: str = Field(..., description="Nominal mission start epoch (ISO-8601 UTC)")
    duration_days: float = Field(14.0, gt=0.0, le=60.0)
    step_minutes: float = Field(30.0, gt=5.0, le=1440.0)
    max_slope_deg: float = Field(15.0, ge=0.0, le=45.0)
    requirements: Optional[MissionRequirements] = None
    uncertainty_config: Optional[UncertaintyDistributionConfig] = None

    @field_validator("start_utc", mode="before")
    @classmethod
    def validate_start_utc(cls, v: Any) -> str:
        return validate_iso_utc_string(str(v))


class ProbabilisticResilienceResponse(BaseModel):
    """Result of repeatable Monte Carlo resilience and uncertainty propagation."""
    site: LandingSite
    nominal_start_utc: str
    duration_days: float
    num_scenarios_evaluated: int
    num_scenarios_feasible: int
    feasibility_frequency: float = Field(..., ge=0.0, le=1.0, description="Fraction of scenarios meeting all mission requirements")
    confidence_interval_95: List[float] = Field(..., description="95% Wilson score confidence interval [lower, upper]")
    scenarios: List[ResilienceScenarioResult]
    parameter_sensitivities: List[ParameterSensitivity]
    failure_mode_breakdown: Dict[str, float] = Field(..., description="Percentage of failed scenarios caused by each constraint")
    most_influential_failure_condition: str
    methodology_and_disclaimer: str


# ---------------------------------------------------------------------------
# Phase 10 — Counterfactual Mission Recovery Intelligence Schemas
# ---------------------------------------------------------------------------

class RecoveryIntervention(BaseModel):
    """A scientifically verified operational intervention to recover an infeasible candidate."""
    intervention_type: str = Field(..., description="'TEMPORAL_SHIFT', 'SPATIAL_RELOCATION', 'OPERATIONAL_RELAXATION', 'COMBINED'")
    title: str
    description: str
    parameters: Dict[str, Any]
    recalculated_metrics: Dict[str, float]
    resolved_constraints: List[str]
    is_resolved: bool
    new_feasibility: bool
    improvement_summary: str
    remaining_risks: List[str]


class CounterfactualRecoveryRequest(BaseModel):
    """Request for automated counterfactual recovery when constraints fail."""
    site: LandingSite
    start_utc: str = Field(..., description="Nominal mission start epoch (ISO-8601 UTC)")
    duration_days: float = Field(14.0, gt=0.0, le=60.0)
    step_minutes: float = Field(30.0, gt=5.0, le=1440.0)
    max_slope_deg: float = Field(15.0, ge=0.0, le=45.0)
    requirements: Optional[MissionRequirements] = None

    @field_validator("start_utc", mode="before")
    @classmethod
    def validate_start_utc(cls, v: Any) -> str:
        return validate_iso_utc_string(str(v))


class CounterfactualRecoveryResponse(BaseModel):
    """Full counterfactual recovery intelligence response with verified interventions."""
    site: LandingSite
    baseline_evaluation: MissionEvaluationResponse
    binding_failure_cause: str
    interventions_evaluated: List[RecoveryIntervention]
    optimal_recovery_path: Optional[RecoveryIntervention]
    recovery_recommendation: str
    scientific_validation_note: str


ContinuityEnvelopeResult.model_rebuild()


