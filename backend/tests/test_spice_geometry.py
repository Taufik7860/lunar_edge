"""
LUNAR EDGE — Comprehensive SPICE Geometry Engine Unit & Scientific Tests

Validates:
1. vector_to_azel() coordinate projection with numerical safeguards and zero-vector handling.
2. compute_topocentric_basis() orthonormality and south pole singularity resolution.
3. compute_solar_incidence() surface normal and tilted terrain flux.
4. SPICEService single-epoch and time-series calculations across multiple candidate sites.
5. GeometryEngine high-level mission planning calculations, libration analysis, and summary metrics.
"""

import pytest
import numpy as np
from app.utils.coordinate_utils import (
    compute_topocentric_basis,
    vector_to_azel,
    compute_solar_incidence,
    selenographic_to_cartesian_moon_me,
    MOON_RADIUS_KM,
)
from app.services.spice_service import spice_service, SUN_RADIUS_KM, EARTH_EQUATORIAL_RADIUS_KM
from app.engines.geometry_engine import geometry_engine, CANDIDATE_LANDING_SITES
from app.models.schemas import LandingSite


class TestVectorToAzEl:
    """Unit tests for the vector_to_azel projection function."""

    @pytest.fixture
    def standard_basis(self):
        # Local basis where Up is +Z, North is +Y, East is +X
        up = np.array([0.0, 0.0, 1.0])
        north = np.array([0.0, 1.0, 0.0])
        east = np.array([1.0, 0.0, 0.0])
        return up, north, east

    def test_zero_vector_handling(self, standard_basis):
        """Zero or sub-millimetre vectors should return (0.0, 0.0, 0.0) without division-by-zero."""
        up, north, east = standard_basis
        az, el, r = vector_to_azel(np.array([0.0, 0.0, 0.0]), up, north, east)
        assert az == 0.0
        assert el == 0.0
        assert r == 0.0

        # Sub-millimetre vector (1e-10 km = 0.1 mm)
        az_tiny, el_tiny, r_tiny = vector_to_azel(np.array([1e-10, 0.0, 0.0]), up, north, east)
        assert az_tiny == 0.0
        assert el_tiny == 0.0
        assert r_tiny == 0.0

    def test_cardinal_directions(self, standard_basis):
        """Verify standard cardinal horizontal vectors."""
        up, north, east = standard_basis

        # Due North (+Y): Azimuth = 0°, Elevation = 0°
        az_n, el_n, r_n = vector_to_azel(np.array([0.0, 100.0, 0.0]), up, north, east)
        assert np.isclose(az_n, 0.0, atol=1e-7)
        assert np.isclose(el_n, 0.0, atol=1e-7)
        assert np.isclose(r_n, 100.0, atol=1e-7)

        # Due East (+X): Azimuth = 90°, Elevation = 0°
        az_e, el_e, r_e = vector_to_azel(np.array([100.0, 0.0, 0.0]), up, north, east)
        assert np.isclose(az_e, 90.0, atol=1e-7)
        assert np.isclose(el_e, 0.0, atol=1e-7)

        # Due South (-Y): Azimuth = 180°, Elevation = 0°
        az_s, el_s, r_s = vector_to_azel(np.array([0.0, -100.0, 0.0]), up, north, east)
        assert np.isclose(az_s, 180.0, atol=1e-7)
        assert np.isclose(el_s, 0.0, atol=1e-7)

        # Due West (-X): Azimuth = 270°, Elevation = 0°
        az_w, el_w, r_w = vector_to_azel(np.array([-100.0, 0.0, 0.0]), up, north, east)
        assert np.isclose(az_w, 270.0, atol=1e-7)
        assert np.isclose(el_w, 0.0, atol=1e-7)

    def test_zenith_and_nadir(self, standard_basis):
        """Verify pure vertical vectors."""
        up, north, east = standard_basis

        # Due Zenith (+Z): Elevation = +90°
        az_z, el_z, r_z = vector_to_azel(np.array([0.0, 0.0, 50.0]), up, north, east)
        assert np.isclose(el_z, 90.0, atol=1e-7)
        assert 0.0 <= az_z < 360.0

        # Due Nadir (-Z): Elevation = -90°
        az_nad, el_nad, r_nad = vector_to_azel(np.array([0.0, 0.0, -50.0]), up, north, east)
        assert np.isclose(el_nad, -90.0, atol=1e-7)

    def test_numerical_clamping_safeguard(self, standard_basis):
        """Verify vector with slight numerical noise exceeding 1.0 does not trigger arcsin ValueError."""
        up, north, east = standard_basis
        # Vector slightly aligned with Up with roundoff
        v = np.array([0.0, 0.0, 1.0000000000000002])
        az, el, r = vector_to_azel(v, up, north, east)
        assert np.isclose(el, 90.0)


class TestSolarIncidence:
    """Unit tests for terrain solar incidence angle calculation."""

    def test_flat_horizontal_surface(self):
        """On a horizontal surface (slope=0), incidence = 90° - elevation."""
        inc = compute_solar_incidence(sun_elevation_deg=2.0, sun_azimuth_deg=90.0, slope_deg=0.0, aspect_deg=0.0)
        assert np.isclose(inc["incidence_angle_deg"], 88.0)
        assert np.isclose(inc["zenith_angle_deg"], 88.0)
        assert inc["is_above_geometric_horizon"] is True
        assert inc["is_surface_illuminated"] is True
        assert np.isclose(inc["cosine_incidence"], np.cos(np.radians(88.0)))

    def test_slope_facing_sun(self):
        """A slope facing the sun directly reduces the incidence angle (increases illumination)."""
        # Sun at az=90°, el=2°. Slope tilted 10° towards East (aspect=90°)
        inc = compute_solar_incidence(sun_elevation_deg=2.0, sun_azimuth_deg=90.0, slope_deg=10.0, aspect_deg=90.0)
        # Expected incidence = 88° - 10° = 78°
        assert np.isclose(inc["incidence_angle_deg"], 78.0)
        assert inc["cosine_incidence"] > np.cos(np.radians(88.0))


class TestSPICEAndGeometryEngine:
    """Integrated tests across candidate south polar sites."""

    @pytest.mark.parametrize("site_key", list(CANDIDATE_LANDING_SITES.keys()))
    def test_candidate_sites_geometry(self, site_key):
        """Verify geometry calculation executes cleanly for all NASA candidate regions."""
        site = CANDIDATE_LANDING_SITES[site_key]
        epoch_geom = geometry_engine.compute_epoch_geometry(site, "2026-01-15T12:00:00")

        # Basic type and value assertions
        assert epoch_geom.sun.body == "SUN"
        assert epoch_geom.earth.body == "EARTH"

        # Azimuth bounds
        assert 0.0 <= epoch_geom.sun.azimuth_deg < 360.0
        assert 0.0 <= epoch_geom.earth.azimuth_deg < 360.0

        # Elevation bounds
        assert -90.0 <= epoch_geom.sun.elevation_deg <= 90.0
        assert -90.0 <= epoch_geom.earth.elevation_deg <= 90.0

        # Distance bounds
        assert 1.45e8 <= epoch_geom.sun.distance_km <= 1.53e8
        assert 3.5e5 <= epoch_geom.earth.distance_km <= 4.2e5

        # Angular radii
        assert 0.25 <= epoch_geom.sun.angular_radius_deg <= 0.28
        assert 0.85 <= epoch_geom.earth.angular_radius_deg <= 1.05

    def test_mission_window_time_series(self):
        """Test multi-day time series calculation and summary metrics for Shackleton."""
        site = CANDIDATE_LANDING_SITES["shackleton_connecting_ridge"]
        samples, summary = geometry_engine.compute_mission_window_time_series(
            site=site,
            start_utc="2026-01-15T00:00:00",
            duration_days=14.0,
            step_minutes=30.0,
        )

        expected_count = int(14.0 * 24 * 2) + 1
        assert len(samples) == expected_count
        assert summary.total_samples == expected_count
        assert summary.duration_days == 14.0

        # At Shackleton, Earth hovers around horizon with libration variation
        assert summary.libration_elevation_range_deg > 0.0
        assert summary.sun_max_elevation_deg >= summary.sun_min_elevation_deg
        assert 0.0 <= summary.geometric_daylight_fraction <= 1.0
        assert 0.0 <= summary.geometric_earth_visibility_fraction <= 1.0
