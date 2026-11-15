"""
LUNAR EDGE — Celestial Geometry Engine (Module B)

Provides high-level mission planning calculations for Sun and Earth visibility.
Bridges low-level SPICE ephemerides with mission analysis logic.

Scientific Disclaimers & Assumptions:
  1. Geometric Elevation vs. Terrain-Obstructed Visibility:
     - Geometric elevation measures angle relative to the local horizontal tangent plane
       at the observer's position on the IAU Moon 2000 reference sphere.
     - A positive geometric elevation does NOT guarantee visibility if high topography
       (crater rims, ridges, massifs) obstructs the line-of-sight.
     - True terrain obstruction is evaluated in Module C (Terrain-Aware Visibility Engine).
  2. Earth Line-of-Sight & Libration:
     - Because the Moon is in synchronous rotation with ~7° latitude and ~8° longitude libration,
       Earth oscillates in the local lunar sky in an ellipse over ~27.3 days.
     - At polar sites, Earth hovers very close to the horizon; libration cycles can dip Earth
       below the horizon for days or weeks.
"""

from typing import Optional, List, Dict
import numpy as np

from app.services.spice_service import spice_service
from app.models.schemas import (
    LandingSite,
    BodyGeometry,
    SolarIncidence,
    EpochGeometry,
    TimeSeriesSample,
    GeometrySummary,
)

# Canonical NASA Artemis III Candidate Regions / Points of Interest (LOLA 80m DEM Ground Truth)
CANDIDATE_LANDING_SITES: Dict[str, LandingSite] = {
    "haworth_rim": LandingSite(
        name="Haworth Crater Rim",
        latitude_deg=-87.45,
        longitude_deg=-5.0,
        elevation_m=-3317.5,
        slope_deg=0.0,
        aspect_deg=0.0,
    ),
    "shackleton_connecting_ridge": LandingSite(
        name="Peak Near Shackleton / Connecting Ridge",
        latitude_deg=-89.70,
        longitude_deg=129.0,
        elevation_m=-2795.3,
        slope_deg=5.0,
        aspect_deg=130.0,
    ),
    "nobile_rim_1": LandingSite(
        name="Nobile Crater Rim 1",
        latitude_deg=-85.30,
        longitude_deg=31.5,
        elevation_m=6151.0,
        slope_deg=3.0,
        aspect_deg=45.0,
    ),
    "nobile_rim_2": LandingSite(
        name="Nobile Crater Rim 2",
        latitude_deg=-84.20,
        longitude_deg=60.7,
        elevation_m=1125.2,
        slope_deg=4.0,
        aspect_deg=90.0,
    ),
    "de_gerlache_rim": LandingSite(
        name="de Gerlache Crater Rim",
        latitude_deg=-88.50,
        longitude_deg=-88.0,
        elevation_m=-1060.5,
        slope_deg=6.0,
        aspect_deg=270.0,
    ),
    "exact_south_pole": LandingSite(
        name="Lunar South Pole (Exact)",
        latitude_deg=-90.00,
        longitude_deg=0.0,
        elevation_m=1282.3,
        slope_deg=0.0,
        aspect_deg=0.0,
    ),
}


class GeometryEngine:
    """
    Engine for calculating topocentric celestial geometry, libration envelopes,
    and geometric mission opportunities for lunar surface sites.
    """

    def __init__(self):
        self.spice = spice_service

    def get_candidate_sites(self) -> List[LandingSite]:
        """Return list of pre-configured NASA candidate landing sites."""
        return list(CANDIDATE_LANDING_SITES.values())

    def compute_epoch_geometry(
        self,
        site: LandingSite,
        utc_str: str,
    ) -> EpochGeometry:
        """
        Compute topocentric Sun and Earth geometry at a single UTC epoch.
        """
        et = self.spice.utc_to_et(utc_str)
        raw = self.spice.compute_solar_and_earth_geometry(
            lat_deg=site.latitude_deg,
            lon_deg=site.longitude_deg,
            elevation_m=site.elevation_m,
            et=et,
            slope_deg=site.slope_deg,
            aspect_deg=site.aspect_deg,
        )

        sun_data = raw["sun"]
        earth_data = raw["earth"]
        sol_inc = raw["solar_incidence"]

        return EpochGeometry(
            et=raw["et"],
            utc=raw["utc"],
            sun=BodyGeometry(
                body="SUN",
                azimuth_deg=sun_data["azimuth_deg"],
                elevation_deg=sun_data["elevation_deg"],
                distance_km=sun_data["distance_km"],
                angular_radius_deg=sun_data["angular_radius_deg"],
                angular_diameter_deg=sun_data["angular_diameter_deg"],
                light_time_s=sun_data["light_time_s"],
            ),
            earth=BodyGeometry(
                body="EARTH",
                azimuth_deg=earth_data["azimuth_deg"],
                elevation_deg=earth_data["elevation_deg"],
                distance_km=earth_data["distance_km"],
                angular_radius_deg=earth_data["angular_radius_deg"],
                angular_diameter_deg=earth_data["angular_diameter_deg"],
                light_time_s=earth_data["light_time_s"],
            ),
            solar_incidence=SolarIncidence(
                zenith_angle_deg=sol_inc["zenith_angle_deg"],
                incidence_angle_deg=sol_inc["incidence_angle_deg"],
                cosine_incidence=sol_inc["cosine_incidence"],
                is_above_geometric_horizon=sol_inc["is_above_geometric_horizon"],
                is_surface_illuminated=sol_inc["is_surface_illuminated"],
            ),
        )

    def compute_mission_window_time_series(
        self,
        site: LandingSite,
        start_utc: str,
        duration_days: float = 14.0,
        step_minutes: float = 15.0,
    ) -> tuple[List[TimeSeriesSample], GeometrySummary]:
        """
        Compute efficient geometry time-series over a mission window.
        Returns: (samples, summary)
        """
        raw_samples = self.spice.compute_time_series(
            lat_deg=site.latitude_deg,
            lon_deg=site.longitude_deg,
            elevation_m=site.elevation_m,
            start_utc=start_utc,
            duration_days=duration_days,
            step_minutes=step_minutes,
            slope_deg=site.slope_deg,
            aspect_deg=site.aspect_deg,
        )

        samples = [TimeSeriesSample(**s) for s in raw_samples]

        # Extract arrays for vectorized summary statistics
        sun_el = np.array([s.sun_elevation_deg for s in samples])
        earth_el = np.array([s.earth_elevation_deg for s in samples])
        sun_disc_above = np.array([s.is_sun_disc_partially_above_geometric_horizon for s in samples])
        sun_center_above = np.array([s.is_sun_above_geometric_horizon for s in samples])
        earth_center_above = np.array([s.is_earth_above_geometric_horizon for s in samples])

        n = len(samples)

        summary = GeometrySummary(
            total_samples=n,
            duration_days=duration_days,
            sun_min_elevation_deg=float(np.min(sun_el)),
            sun_max_elevation_deg=float(np.max(sun_el)),
            sun_mean_elevation_deg=float(np.mean(sun_el)),
            geometric_daylight_fraction=float(np.sum(sun_center_above) / n),
            geometric_partial_daylight_fraction=float(np.sum(sun_disc_above) / n),
            earth_min_elevation_deg=float(np.min(earth_el)),
            earth_max_elevation_deg=float(np.max(earth_el)),
            earth_mean_elevation_deg=float(np.mean(earth_el)),
            geometric_earth_visibility_fraction=float(np.sum(earth_center_above) / n),
            libration_elevation_range_deg=float(np.max(earth_el) - np.min(earth_el)),
        )

        return samples, summary


# Global singleton instance
geometry_engine = GeometryEngine()
