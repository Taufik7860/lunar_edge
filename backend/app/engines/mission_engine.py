"""
mission_engine.py — LUNAR EDGE Phase 3

Master mission planning and decision support engine.
Coordinates geometry, terrain, visibility, and continuity engines to evaluate
candidate landing locations across the lunar south pole.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

import numpy as np

from app.engines.geometry_engine import GeometryEngine, CANDIDATE_LANDING_SITES
from app.engines.terrain_engine import TerrainEngine
from app.engines.horizon_engine import compute_horizon_profile
from app.engines.visibility_engine import compute_terrain_visibility_time_series
from app.engines.continuity_engine import ContinuityEngine
from app.models.schemas import (
    LandingSite,
    HorizonProfile,
    VisibilityTimeSeriesResponse,
    ContinuityEnvelopeResult,
    MissionRequirements,
)

logger = logging.getLogger(__name__)


class MissionEngine:
    """
    Main orchestration engine for LUNAR EDGE mission analysis.
    """

    def __init__(
        self,
        terrain_engine: Optional[TerrainEngine] = None,
        geometry_engine: Optional[GeometryEngine] = None,
        continuity_engine: Optional[ContinuityEngine] = None,
    ):
        self.terrain_engine = terrain_engine or TerrainEngine()
        self.geometry_engine = geometry_engine or GeometryEngine()
        self.continuity_engine = continuity_engine or ContinuityEngine(
            terrain_engine=self.terrain_engine,
            geometry_engine=self.geometry_engine,
        )

    def initialize(self):
        """Pre-load DEM metadata and ensure kernels are available."""
        try:
            self.terrain_engine.load()
            logger.info("MissionEngine: TerrainEngine loaded successfully.")
        except Exception as e:
            logger.warning("MissionEngine: DEM not loaded yet (%s). Will lazy-load on demand.", e)

    def get_candidate_sites(self) -> Dict[str, LandingSite]:
        """Return the dictionary of Artemis III candidate sites with LOLA DEM ground-truth elevations."""
        try:
            sites = {}
            for k, s in CANDIDATE_LANDING_SITES.items():
                dem_elev = self.terrain_engine.get_elevation(s.latitude_deg, s.longitude_deg)
                sites[k] = s.model_copy(update={"elevation_m": round(float(dem_elev), 1)})
            return sites
        except Exception:
            return CANDIDATE_LANDING_SITES

    def compute_horizon(
        self,
        site: LandingSite,
        radius_km: float = 20.0,
        n_azimuths: int = 360,
    ) -> HorizonProfile:
        """
        Computes the 360° terrain horizon obstruction profile for a landing site.
        """
        patch = self.terrain_engine.extract_patch(
            lat_deg=site.latitude_deg,
            lon_deg=site.longitude_deg,
            radius_km=radius_km,
        )
        horizon = compute_horizon_profile(patch=patch, n_azimuths=n_azimuths)

        azimuths = [float(i * (360.0 / n_azimuths)) for i in range(n_azimuths)]
        elevations = [float(h) for h in horizon]

        updated_site = site.model_copy(update={"elevation_m": round(patch.observer_elevation_m, 2)})

        return HorizonProfile(
            site=updated_site,
            azimuths_deg=azimuths,
            horizon_elevations_deg=elevations,
            min_horizon_deg=round(float(np.min(horizon)), 3),
            max_horizon_deg=round(float(np.max(horizon)), 3),
            mean_horizon_deg=round(float(np.mean(horizon)), 3),
            observer_elevation_m=round(patch.observer_elevation_m, 2),
            radius_km=radius_km,
        )

    def evaluate_mission_visibility(
        self,
        site: LandingSite,
        start_utc: str,
        duration_days: float = 14.0,
        step_minutes: float = 15.0,
        horizon_radius_km: float = 20.0,
    ) -> VisibilityTimeSeriesResponse:
        """
        Computes full terrain-aware visibility time series (Sun, Earth, intervals).
        """
        # 1. Local terrain horizon and observer elevation from DEM
        try:
            patch = self.terrain_engine.extract_patch(
                lat_deg=site.latitude_deg,
                lon_deg=site.longitude_deg,
                radius_km=horizon_radius_km,
            )
            horizon = compute_horizon_profile(patch=patch, n_azimuths=360)
            eval_site = site.model_copy(update={"elevation_m": round(patch.observer_elevation_m, 2)})
        except Exception as e:
            logger.warning("DEM horizon extraction unavailable, using spherical horizon (0°): %s", e)
            horizon = np.zeros(360, dtype=np.float64)
            eval_site = site

        # 2. Ephemeris & topocentric geometry using true DEM observer position
        geo_samples, _ = self.geometry_engine.compute_mission_window_time_series(
            site=eval_site,
            start_utc=start_utc,
            duration_days=duration_days,
            step_minutes=step_minutes,
        )

        # 3. Terrain-aware visibility
        return compute_terrain_visibility_time_series(
            geometry_samples=geo_samples,
            horizon_profile=horizon,
            site_name=eval_site.name,
        )

    def evaluate_continuity_envelope(
        self,
        site: LandingSite,
        start_utc: str,
        duration_days: float = 14.0,
        step_minutes: float = 30.0,
        requirements: Optional[MissionRequirements] = None,
    ) -> ContinuityEnvelopeResult:
        """
        Runs the Mission Continuity Envelope robustness analysis.
        """
        return self.continuity_engine.evaluate_continuity_envelope(
            site=site,
            start_utc=start_utc,
            duration_days=duration_days,
            step_minutes=step_minutes,
            requirements=requirements,
        )
