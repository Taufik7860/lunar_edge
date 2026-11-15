"""
test_geometry_advanced.py — Advanced precision validation for SPICEService and GeometryEngine.

Validates:
1. Sub-solar point coordinates (lunar obliquity limits ~1.54°).
2. Sub-Earth point coordinates (lunar libration envelope: lat ~±7°, lon ~±8°).
3. 28-day lunar libration cycle continuity and bounds.
4. Topocentric basis orthonormality across multiple polar latitudes and longitudes.
5. South pole singularity stability and right-handed orientation.
6. Celestial light-time physical ranges (Sun ~500s, Earth ~1.3s).
7. Complex terrain solar incidence angles (e.g. 45° tilt, self-shadowed slopes).
8. BodyGeometry schema population with sub-body coordinates.
"""

import numpy as np
import pytest

from app.engines.geometry_engine import GeometryEngine
from app.models.schemas import LandingSite
from app.services.spice_service import SPICEService
from app.utils.coordinate_utils import (
    compute_solar_incidence,
    compute_topocentric_basis,
    selenographic_to_cartesian_moon_me,
    vector_to_azel,
)


@pytest.fixture(scope="module")
def spice_svc():
    svc = SPICEService()
    svc.load_kernels()
    return svc


@pytest.fixture(scope="module")
def geom_engine():
    return GeometryEngine()


def test_sub_solar_coordinates(spice_svc):
    """
    Sub-solar point latitude is bounded by the Moon's obliquity to the ecliptic (~1.54°).
    Longitude moves ~360° over one synodic month (~29.5 days).
    """
    et = spice_svc.utc_to_et("2026-07-01T00:00:00Z")
    sub_lat, sub_lon = spice_svc.compute_subpnt("SUN", et)

    assert abs(sub_lat) <= 1.6, f"Sub-solar latitude {sub_lat}° exceeds lunar obliquity bound (1.6°)"
    assert -180.0 <= sub_lon <= 180.0


def test_sub_earth_libration_bounds(spice_svc):
    """
    Sub-Earth point corresponds to lunar optical and physical libration.
    Libration in latitude is bounded by ~±7.0°.
    Libration in longitude is bounded by ~±8.5°.
    """
    et = spice_svc.utc_to_et("2026-07-01T00:00:00Z")
    lib = spice_svc.compute_earth_libration(et)

    lat = lib["libration_lat_deg"]
    lon = lib["libration_lon_deg"]

    assert abs(lat) <= 7.5, f"Latitude libration {lat}° exceeds physical maximum (7.5°)"
    assert abs(lon) <= 9.0, f"Longitude libration {lon}° exceeds physical maximum (9.0°)"
    assert "sub_earth_point" in lib


def test_libration_cycle_28_days(geom_engine):
    """Compute full 28-day libration cycle and verify continuity and non-zero range."""
    cycle = geom_engine.compute_libration_cycle(
        start_utc="2026-01-01T00:00:00Z",
        duration_days=28.0,
        step_days=1.0,
    )

    assert len(cycle) == 29
    lats = [c["libration_lat_deg"] for c in cycle]
    lons = [c["libration_lon_deg"] for c in cycle]

    # Verify libration oscillation (must explore positive and negative excursions)
    lat_range = max(lats) - min(lats)
    lon_range = max(lons) - min(lons)

    assert lat_range > 8.0, f"Expected latitude libration range > 8°, got {lat_range:.2f}°"
    assert lon_range > 10.0, f"Expected longitude libration range > 10°, got {lon_range:.2f}°"

    # Max step change in 24 hours should be smooth (< 2° per day)
    for i in range(len(lats) - 1):
        assert abs(lats[i + 1] - lats[i]) < 2.0
        assert abs(lons[i + 1] - lons[i]) < 2.0


def test_topocentric_basis_orthonormality():
    """Verify orthonormality and right-handedness of topocentric basis across polar coordinates."""
    test_coords = [
        (-80.0, 0.0),
        (-85.0, 45.0),
        (-88.5, -90.0),
        (-89.7, 129.0),
        (-89.999, -170.0),
        (-90.0, 0.0),  # Exact south pole
    ]

    for lat, lon in test_coords:
        up, north, east = compute_topocentric_basis(lat, lon)

        # Norms must be 1.0
        assert np.isclose(np.linalg.norm(up), 1.0, atol=1e-12)
        assert np.isclose(np.linalg.norm(north), 1.0, atol=1e-12)
        assert np.isclose(np.linalg.norm(east), 1.0, atol=1e-12)

        # Mutual dot products must be 0.0
        assert np.isclose(np.dot(up, north), 0.0, atol=1e-12)
        assert np.isclose(np.dot(up, east), 0.0, atol=1e-12)
        assert np.isclose(np.dot(north, east), 0.0, atol=1e-12)

        # Right-handedness: East x North = Up
        cross_en = np.cross(east, north)
        assert np.allclose(cross_en, up, atol=1e-12)


def test_light_time_physical_bounds(spice_svc):
    """One-way light time bounds for Sun and Earth."""
    et = spice_svc.utc_to_et("2026-07-01T00:00:00Z")
    sun = spice_svc.compute_body_topocentric("SUN", -89.7, 0.0, 0.0, et)
    earth = spice_svc.compute_body_topocentric("EARTH", -89.7, 0.0, 0.0, et)

    # Sun: 1.47e8 to 1.52e8 km / 299792 km/s -> 490s to 510s
    assert 485.0 <= sun["light_time_s"] <= 515.0
    # Earth: 3.6e5 to 4.1e5 km / 299792 km/s -> 1.2s to 1.4s
    assert 1.15 <= earth["light_time_s"] <= 1.45


def test_body_geometry_sub_point_population(geom_engine):
    """Verify BodyGeometry in compute_epoch_geometry contains populated sub_lat_deg and sub_lon_deg."""
    site = LandingSite(
        name="Shackleton Test",
        latitude_deg=-89.7,
        longitude_deg=-129.0,
        elevation_m=674.7,
    )
    geom = geom_engine.compute_epoch_geometry(site, "2026-07-01T00:00:00Z")

    assert geom.sun.sub_lat_deg is not None
    assert geom.sun.sub_lon_deg is not None
    assert abs(geom.sun.sub_lat_deg) <= 1.6

    assert geom.earth.sub_lat_deg is not None
    assert geom.earth.sub_lon_deg is not None
    assert abs(geom.earth.sub_lat_deg) <= 7.5


def test_solar_incidence_arbitrary_slopes():
    """Test steep slopes, slopes tilted away from the sun, and grazing angles."""
    # Sun at el = 1.5°, az = 180° (due South)

    # 1. Slope of 30° facing South (aspect = 180°): directly tilted towards sun
    # Expected incidence = 90° - (1.5° + 30°) = 58.5°
    inc_south = compute_solar_incidence(1.5, 180.0, slope_deg=30.0, aspect_deg=180.0)
    assert np.isclose(inc_south["incidence_angle_deg"], 58.5, atol=1e-5)
    assert inc_south["is_surface_illuminated"] is True
    assert inc_south["cosine_incidence"] == pytest.approx(np.cos(np.radians(58.5)), abs=1e-5)

    # 2. Slope of 30° facing North (aspect = 0°): tilted away from sun
    # Normal tilted North, sun coming from South -> dot product < 0
    inc_north = compute_solar_incidence(1.5, 180.0, slope_deg=30.0, aspect_deg=0.0)
    assert inc_north["incidence_angle_deg"] > 90.0
    assert inc_north["cosine_incidence"] == 0.0
    assert inc_north["is_surface_illuminated"] is False
