/**
 * LUNAR EDGE — API Types and Interfaces
 * Matches backend schemas from app/models/schemas.py
 */

export interface LandingSite {
  name: string;
  latitude_deg: number;
  longitude_deg: number;
  elevation_m: number;
  slope_deg: number;
  aspect_deg: number;
}

export interface BodyGeometry {
  body: string;
  azimuth_deg: number;
  elevation_deg: number;
  distance_km: number;
  angular_radius_deg: number;
  angular_diameter_deg: number;
  light_time_s: number;
}

export interface SolarIncidence {
  zenith_angle_deg: number;
  incidence_angle_deg: number;
  cosine_incidence: number;
  is_above_geometric_horizon: boolean;
  is_surface_illuminated: boolean;
}

export interface EpochGeometry {
  et: number;
  utc: string;
  sun: BodyGeometry;
  earth: BodyGeometry;
  solar_incidence: SolarIncidence;
}

export interface TimeSeriesSample {
  et: number;
  utc: string;
  sun_azimuth_deg: number;
  sun_elevation_deg: number;
  sun_distance_km: number;
  sun_angular_radius_deg: number;
  sun_angular_diameter_deg: number;
  earth_azimuth_deg: number;
  earth_elevation_deg: number;
  earth_distance_km: number;
  earth_angular_radius_deg: number;
  earth_angular_diameter_deg: number;
  solar_incidence_angle_deg: number;
  solar_cosine_incidence: number;
  is_sun_above_geometric_horizon: boolean;
  is_sun_disc_partially_above_geometric_horizon: boolean;
  is_earth_above_geometric_horizon: boolean;
  is_earth_disc_partially_above_geometric_horizon: boolean;
}

export interface GeometrySummary {
  total_samples: number;
  duration_days: number;
  sun_min_elevation_deg: number;
  sun_max_elevation_deg: number;
  sun_mean_elevation_deg: number;
  geometric_daylight_fraction: number;
  geometric_partial_daylight_fraction: number;
  earth_min_elevation_deg: number;
  earth_max_elevation_deg: number;
  earth_mean_elevation_deg: number;
  geometric_earth_visibility_fraction: number;
  libration_elevation_range_deg: number;
  note: string;
}

export interface HorizonProfile {
  site: LandingSite;
  azimuths_deg: number[];
  horizon_elevations_deg: number[];
  min_horizon_deg: number;
  max_horizon_deg: number;
  mean_horizon_deg: number;
  observer_elevation_m: number;
  radius_km: number;
}

export interface VisibilitySample {
  et: number;
  utc: string;
  sun_azimuth_deg: number;
  sun_elevation_deg: number;
  sun_angular_radius_deg: number;
  sun_horizon_elevation_deg: number;
  sun_clearance_deg: number;
  sun_illumination_fraction: number;
  is_sunlit: boolean;
  is_sun_partial: boolean;

  earth_azimuth_deg: number;
  earth_elevation_deg: number;
  earth_angular_radius_deg: number;
  earth_horizon_elevation_deg: number;
  earth_clearance_deg: number;
  is_earth_visible: boolean;

  is_simultaneous_operating: boolean;
}

export interface MissionInterval {
  type: 'SUNLIT' | 'PARTIAL' | 'DARK' | 'EARTH_VISIBLE' | 'EARTH_BLOCKED' | 'SIMULTANEOUS';
  start_utc: string;
  end_utc: string;
  duration_hours: number;
}

export interface VisibilitySummary {
  site_name: string;
  start_utc: string;
  duration_days: number;
  step_minutes: number;
  total_samples: number;

  sunlit_hours: number;
  partial_hours: number;
  dark_hours: number;
  sunlit_fraction: number;
  longest_sunlit_window_hours: number;
  longest_dark_period_hours: number;

  earth_visible_hours: number;
  earth_visible_fraction: number;
  longest_earth_visible_window_hours: number;
  longest_earth_blackout_hours: number;

  simultaneous_hours: number;
  simultaneous_fraction: number;
  longest_simultaneous_window_hours: number;

  intervals: MissionInterval[];
}

export interface VisibilityTimeSeriesResponse {
  summary: VisibilitySummary;
  samples: VisibilitySample[];
}

export interface MissionRequirements {
  min_continuous_sunlight_hours: number;
  max_tolerable_dark_hours: number;
  min_continuous_earth_comms_hours: number;
  min_simultaneous_operating_hours: number;
}

export interface PerturbedEvaluation {
  displacement_dx_m: number;
  displacement_dy_m: number;
  displacement_distance_m: number;
  date_slippage_days: number;
  evaluated_lat_deg: number;
  evaluated_lon_deg: number;
  evaluated_start_utc: string;

  sunlit_hours: number;
  sunlit_fraction: number;
  longest_sunlit_window_hours: number;
  longest_dark_period_hours: number;
  longest_comms_window_hours: number;
  longest_simultaneous_hours: number;

  meets_requirements: boolean;
  failure_reasons: string[];
}

export interface ContinuityEnvelopeResult {
  baseline_site: LandingSite;
  baseline_summary: VisibilitySummary;
  requirements: MissionRequirements;
  baseline_meets_requirements: boolean;
  baseline_failure_reasons: string[];

  perturbations: PerturbedEvaluation[];
  spatial_success_rate: number;
  temporal_success_rate: number;
  overall_robustness_score: number;
}

export interface SystemHealth {
  status: string;
  spice_kernels_loaded: boolean;
  spice_kernel_count: number;
  dem_file_exists: boolean;
  dem_path: string;
  candidate_sites_count: number;
}

// ---------------------------------------------------------------------------
// Workstation 5-Workspace & Extended Feature Types
// ---------------------------------------------------------------------------

export type WorkspaceId =
  | 'explorer'
  | 'discovery'
  | 'intelligence'
  | 'resilience'
  | 'recovery';

export type ScreeningStatus =
  | 'Screening-viable'
  | 'Conditional'
  | 'Infeasible'
  | 'Insufficient data'
  | 'Outside coverage'
  | 'SCREENING_VIABLE'; // backward compatibility

export interface GeographicBounds {
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
}

export interface OpportunityDiscoveryRequest {
  mission_name: string;
  target_region: string;
  bounds?: GeographicBounds;
  start_utc: string;
  duration_days: number;
  step_minutes?: number;
  requirements: MissionRequirements;
  max_slope_deg?: number;
}

export interface CandidateExplainability {
  why_this_location: string;
  satisfied_requirements: string[];
  unsatisfied_requirements: string[];
  favourable_factors: string[];
  unfavourable_factors: string[];
  identified_risks: string[];
}

export interface DiscoveredCandidate {
  key: string;
  name: string;
  latitude_deg: number;
  longitude_deg: number;
  elevation_m: number;
  slope_deg: number;
  aspect_deg: number;
  boundary_polygon: number[][]; // [lat, lon][]
  classification: 'Screening-viable' | 'Conditional' | 'Infeasible' | 'Insufficient data' | 'Outside coverage';
  sunlight_percentage: number;
  sunlit_hours: number;
  longest_dark_period_hours: number;
  longest_comms_window_hours: number;
  longest_simultaneous_window_hours: number;
  mean_horizon_deg: number;
  composite_score: number;
  data_coverage_status: string;
  constraints_assessment: {
    min_continuous_sunlight: boolean;
    max_tolerable_darkness: boolean;
    min_continuous_earth_comms: boolean;
    max_terrain_slope: boolean;
  };
  explanation: CandidateExplainability;
}

export interface OpportunityDiscoveryResponse {
  mission_name: string;
  search_region: string;
  start_utc: string;
  duration_days: number;
  total_evaluated: number;
  viable_count: number;
  conditional_count: number;
  infeasible_count: number;
  candidates: DiscoveredCandidate[];
}

export interface DiscoveryCandidate {
  site_key: string;
  site: LandingSite;
  status: ScreeningStatus;
  score: number; // 0 - 100
  sunlight_hours: number;
  sunlit_fraction: number;
  longest_dark_hours: number;
  earth_comm_hours: number;
  simultaneous_hours: number;
  elevation_m: number;
  slope_deg: number;
  key_advantages: string[];
  risk_factors: string[];
  provenance: string;
}

export type InterventionStatus =
  | 'PROPOSED'
  | 'ANALYTICALLY_EVALUATED'
  | 'FULLY_RECALCULATED'
  | 'VERIFIED';

export interface RecoveryIntervention {
  id: string;
  title: string;
  type: 'TEMPORAL_SHIFT' | 'SPATIAL_RELOCATION' | 'ASSET_UPGRADE' | 'ORBITAL_RELAY';
  description: string;
  status: InterventionStatus;
  baseline_metric: string;
  projected_metric: string;
  improvement_delta: string;
  residual_risk: string;
  feasibility_score: number; // 0 - 100
}

export interface LayerSettings {
  elevationHeatmap: boolean;
  coordinateGrid: boolean;
  candidateRegions: boolean;
  sunDirectionVector: boolean;
  earthDirectionVector: boolean;
  dispersionFootprint: boolean;
  highResSouthPoleMesh: boolean;
}
