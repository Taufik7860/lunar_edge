"""
continuity_engine.py — LUNAR EDGE Phase 3

Mission Continuity Envelope Engine.
Performs deterministic sensitivity and robustness analysis for lunar landing sites.

Evaluates how mission opportunities and constraints degrade or hold when:
  1. Spatial Landing Dispersion: Touchdown occurs ±50m to ±250m off-target (touchdown uncertainty ellipse).
  2. Temporal Launch Slippage: Landing date slips by ±1 to ±7 days.

Determines whether critical mission requirements (e.g., continuous daylight for solar arrays,
maximum dark period surviving on battery, direct-to-Earth communications) still succeed or fail,
providing mission planners with a quantitative Robustness Score.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Tuple, Optional

import numpy as np

from app.engines.geometry_engine import GeometryEngine
from app.engines.horizon_engine import compute_horizon_profile
from app.engines.terrain_engine import TerrainEngine
from app.engines.visibility_engine import compute_terrain_visibility_time_series
from app.models.schemas import (
    LandingSite,
    MissionRequirements,
    PerturbedEvaluation,
    ContinuityEnvelopeResult,
    VisibilitySummary,
)

logger = logging.getLogger(__name__)


class ContinuityEngine:
    """
    Engine for calculating the Mission Continuity Envelope.
    Evaluates sensitivity of mission requirements to landing dispersion and launch date slippage.
    """

    def __init__(self, terrain_engine: Optional[TerrainEngine] = None, geometry_engine: Optional[GeometryEngine] = None):
        self.terrain_engine = terrain_engine or TerrainEngine()
        self.geometry_engine = geometry_engine or GeometryEngine()

    def evaluate_continuity_envelope(
        self,
        site: LandingSite,
        start_utc: str,
        duration_days: float = 14.0,
        step_minutes: float = 30.0,
        requirements: Optional[MissionRequirements] = None,
        spatial_radii_m: Optional[List[float]] = None,
        temporal_offsets_days: Optional[List[float]] = None,
    ) -> ContinuityEnvelopeResult:
        """
        Runs the full Mission Continuity Envelope analysis.

        Args:
            site: Target landing site
            start_utc: Nominal landing epoch ISO string (e.g. '2026-02-01T00:00:00Z')
            duration_days: Mission duration in days
            step_minutes: Geometry calculation time step in minutes
            requirements: Thresholds for power, battery, and comms success
            spatial_radii_m: Dispersion distances to test (defaults to [50, 150, 250] meters)
            temporal_offsets_days: Launch slippage offsets in days (defaults to [-3, -1, 1, 3])
        """
        reqs = requirements or MissionRequirements()
        radii = spatial_radii_m if spatial_radii_m is not None else [100.0, 250.0]
        slippages = temporal_offsets_days if temporal_offsets_days is not None else [-2.0, -1.0, 1.0, 2.0]

        # 1. Baseline Evaluation
        baseline_summary, baseline_passes, baseline_reasons = self._evaluate_single_configuration(
            site=site,
            start_utc=start_utc,
            duration_days=duration_days,
            step_minutes=step_minutes,
            reqs=reqs,
        )

        perturbations: List[PerturbedEvaluation] = []
        spatial_results: List[bool] = []
        temporal_results: List[bool] = []

        # 2. Spatial Perturbations (in Topocentric Horizon Directions)
        # 4 cardinal directions (True North, True East, True South, True West) for each radius
        obs_x, obs_y = self.terrain_engine.selenographic_to_polar_stereo(site.latitude_deg, site.longitude_deg)

        r_obs = float(np.sqrt(obs_x**2 + obs_y**2))
        if r_obs < 1e-3:
            u_north = np.array([0.0, 1.0])
            u_east = np.array([1.0, 0.0])
        else:
            lon_rad = float(np.arctan2(obs_x, obs_y))
            u_north = np.array([np.sin(lon_rad), np.cos(lon_rad)])
            u_east = np.array([np.cos(lon_rad), -np.sin(lon_rad)])

        for r in radii:
            directions = [
                ("North", float(r * u_north[0]), float(r * u_north[1])),
                ("East", float(r * u_east[0]), float(r * u_east[1])),
                ("South", float(-r * u_north[0]), float(-r * u_north[1])),
                ("West", float(-r * u_east[0]), float(-r * u_east[1])),
            ]
            for dir_name, dx, dy in directions:
                pert_x = obs_x + dx
                pert_y = obs_y + dy
                pert_lat, pert_lon = self.terrain_engine.polar_stereo_to_selenographic(pert_x, pert_y)
                
                # Query actual LOLA DEM elevation at displaced touchdown location
                try:
                    pert_elev = float(self.terrain_engine.get_elevation(pert_lat, pert_lon))
                except Exception:
                    pert_elev = site.elevation_m

                # Perturbed site
                pert_site = LandingSite(
                    name=f"{site.name} ({dir_name} {int(r)}m)",
                    latitude_deg=pert_lat,
                    longitude_deg=pert_lon,
                    elevation_m=pert_elev,
                    slope_deg=site.slope_deg,
                    aspect_deg=site.aspect_deg,
                )

                summary, passes, reasons = self._evaluate_single_configuration(
                    site=pert_site,
                    start_utc=start_utc,
                    duration_days=duration_days,
                    step_minutes=step_minutes,
                    reqs=reqs,
                )

                spatial_results.append(passes)
                perturbations.append(
                    PerturbedEvaluation(
                        displacement_dx_m=round(dx, 1),
                        displacement_dy_m=round(dy, 1),
                        displacement_distance_m=round(r, 1),
                        date_slippage_days=0.0,
                        evaluated_lat_deg=round(pert_lat, 6),
                        evaluated_lon_deg=round(pert_lon, 6),
                        evaluated_start_utc=start_utc,
                        sunlit_hours=summary.sunlit_hours,
                        sunlit_fraction=summary.sunlit_fraction,
                        longest_sunlit_window_hours=summary.longest_sunlit_window_hours,
                        longest_dark_period_hours=summary.longest_dark_period_hours,
                        longest_comms_window_hours=summary.longest_earth_visible_window_hours,
                        longest_simultaneous_hours=summary.longest_simultaneous_window_hours,
                        meets_requirements=passes,
                        failure_reasons=reasons,
                    )
                )

        # 3. Temporal Perturbations (Date Slippage)
        base_dt = datetime.fromisoformat(start_utc.replace("Z", "+00:00"))

        for slip in slippages:
            pert_dt = base_dt + timedelta(days=slip)
            pert_utc = pert_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

            summary, passes, reasons = self._evaluate_single_configuration(
                site=site,
                start_utc=pert_utc,
                duration_days=duration_days,
                step_minutes=step_minutes,
                reqs=reqs,
            )

            temporal_results.append(passes)
            perturbations.append(
                PerturbedEvaluation(
                    displacement_dx_m=0.0,
                    displacement_dy_m=0.0,
                    displacement_distance_m=0.0,
                    date_slippage_days=round(slip, 1),
                    evaluated_lat_deg=round(site.latitude_deg, 6),
                    evaluated_lon_deg=round(site.longitude_deg, 6),
                    evaluated_start_utc=pert_utc,
                    sunlit_hours=summary.sunlit_hours,
                    sunlit_fraction=summary.sunlit_fraction,
                    longest_sunlit_window_hours=summary.longest_sunlit_window_hours,
                    longest_dark_period_hours=summary.longest_dark_period_hours,
                    longest_comms_window_hours=summary.longest_earth_visible_window_hours,
                    longest_simultaneous_hours=summary.longest_simultaneous_window_hours,
                    meets_requirements=passes,
                    failure_reasons=reasons,
                )
            )

        # 4. Success Rates and Composite Robustness Score
        spatial_rate = float(np.mean(spatial_results)) if spatial_results else 1.0
        temporal_rate = float(np.mean(temporal_results)) if temporal_results else 1.0
        overall_score = float(0.5 * spatial_rate + 0.5 * temporal_rate)

        return ContinuityEnvelopeResult(
            baseline_site=site,
            baseline_summary=baseline_summary,
            requirements=reqs,
            baseline_meets_requirements=baseline_passes,
            baseline_failure_reasons=baseline_reasons,
            perturbations=perturbations,
            spatial_success_rate=round(spatial_rate, 4),
            temporal_success_rate=round(temporal_rate, 4),
            overall_robustness_score=round(overall_score, 4),
        )

    def _evaluate_single_configuration(
        self,
        site: LandingSite,
        start_utc: str,
        duration_days: float,
        step_minutes: float,
        reqs: MissionRequirements,
    ) -> Tuple[VisibilitySummary, bool, List[str]]:
        """Evaluates geometry + terrain horizon + visibility for one specific config."""
        # A. Ephemeris geometry time-series
        geo_samples, _ = self.geometry_engine.compute_mission_window_time_series(
            site=site,
            start_utc=start_utc,
            duration_days=duration_days,
            step_minutes=step_minutes,
        )

        # B. Terrain horizon profile
        try:
            patch = self.terrain_engine.extract_patch(
                lat_deg=site.latitude_deg,
                lon_deg=site.longitude_deg,
                radius_km=15.0,
            )
            horizon = compute_horizon_profile(patch=patch, n_azimuths=180, n_range_steps=200)
        except Exception as e:
            logger.warning("DEM horizon extraction fallback to 0°: %s", e)
            horizon = np.zeros(180, dtype=np.float64)

        # C. Terrain visibility
        vis_resp = compute_terrain_visibility_time_series(
            geometry_samples=geo_samples,
            horizon_profile=horizon,
            site_name=site.name,
        )
        summary = vis_resp.summary

        # D. Test requirements
        reasons: List[str] = []
        if summary.longest_sunlit_window_hours < reqs.min_continuous_sunlight_hours:
            reasons.append(
                f"Continuous sunlight window ({summary.longest_sunlit_window_hours:.1f}h) "
                f"< required ({reqs.min_continuous_sunlight_hours:.1f}h)"
            )
        if summary.longest_dark_period_hours > reqs.max_tolerable_dark_hours:
            reasons.append(
                f"Continuous darkness period ({summary.longest_dark_period_hours:.1f}h) "
                f"> battery limit ({reqs.max_tolerable_dark_hours:.1f}h)"
            )
        if summary.longest_earth_visible_window_hours < reqs.min_continuous_earth_comms_hours:
            reasons.append(
                f"Continuous Earth comms window ({summary.longest_earth_visible_window_hours:.1f}h) "
                f"< required ({reqs.min_continuous_earth_comms_hours:.1f}h)"
            )
        if summary.longest_simultaneous_window_hours < reqs.min_simultaneous_operating_hours:
            reasons.append(
                f"Continuous simultaneous window ({summary.longest_simultaneous_window_hours:.1f}h) "
                f"< required ({reqs.min_simultaneous_operating_hours:.1f}h)"
            )

        meets_reqs = (len(reasons) == 0)
        return summary, meets_reqs, reasons
