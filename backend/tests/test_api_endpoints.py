"""
Integration tests for LUNAR EDGE FastAPI endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_api_health():
    """Verify health check returns status and loaded SPICE kernels."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["spice_kernels_loaded"] is True
    assert data["spice_kernel_count"] >= 7
    assert data["candidate_sites_count"] >= 6


def test_api_list_sites():
    """Verify pre-configured candidate landing sites list."""
    response = client.get("/api/sites")
    assert response.status_code == 200
    sites = response.json()
    assert "shackleton_connecting_ridge" in sites
    assert "haworth_rim" in sites
    assert "nobile_rim_1" in sites
    assert "exact_south_pole" in sites
    
    shackleton = sites["shackleton_connecting_ridge"]
    assert shackleton["latitude_deg"] < -89.0


def test_api_epoch_geometry():
    """Verify instantaneous Sun/Earth topocentric geometry calculation."""
    payload = {
        "site": {
            "name": "Shackleton Connecting Ridge",
            "latitude_deg": -89.45,
            "longitude_deg": 0.0,
            "elevation_m": 1200.0,
            "slope_deg": 0.0,
            "aspect_deg": 0.0,
        },
        "utc": "2026-02-01T12:00:00Z",
    }
    response = client.post("/api/geometry/epoch", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "sun" in data
    assert "earth" in data
    assert 0.0 <= data["sun"]["azimuth_deg"] <= 360.0
    assert 0.0 <= data["earth"]["azimuth_deg"] <= 360.0
    assert data["sun"]["distance_km"] > 140_000_000.0
    assert 350_000.0 < data["earth"]["distance_km"] < 410_000.0


def test_api_geometry_timeseries():
    """Verify multi-day mission window ephemeris calculation."""
    payload = {
        "site": {
            "name": "Exact South Pole",
            "latitude_deg": -90.0,
            "longitude_deg": 0.0,
            "elevation_m": 0.0,
            "slope_deg": 0.0,
            "aspect_deg": 0.0,
        },
        "start_utc": "2026-01-01T00:00:00Z",
        "duration_days": 1.0,
        "step_minutes": 120.0,
    }
    response = client.post("/api/geometry/timeseries", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "samples" in data
    assert len(data["samples"]) == 13  # 24h / 2h + 1


def test_api_terrain_elevation():
    """Verify elevation query endpoint."""
    payload = {
        "latitude_deg": -89.70,
        "longitude_deg": 129.0,
    }
    response = client.post("/api/terrain/elevation", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "elevation_m" in data
    assert "polar_stereo_x_m" in data
    assert "polar_stereo_y_m" in data


def test_api_terrain_horizon():
    """Verify 360-degree terrain horizon profiling endpoint."""
    payload = {
        "site": {
            "name": "Shackleton Connecting Ridge",
            "latitude_deg": -89.70,
            "longitude_deg": 129.0,
            "elevation_m": 1120.0,
            "slope_deg": 5.0,
            "aspect_deg": 130.0,
        },
        "radius_km": 10.0,
        "n_azimuths": 72,
    }
    response = client.post("/api/terrain/horizon", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["azimuths_deg"]) == 72
    assert len(data["horizon_elevations_deg"]) == 72
    assert data["min_horizon_deg"] <= data["max_horizon_deg"]


def test_api_visibility_evaluate():
    """Verify terrain-aware visibility time series endpoint."""
    payload = {
        "site": {
            "name": "Shackleton Connecting Ridge",
            "latitude_deg": -89.70,
            "longitude_deg": 129.0,
            "elevation_m": 1120.0,
            "slope_deg": 5.0,
            "aspect_deg": 130.0,
        },
        "start_utc": "2026-02-01T00:00:00Z",
        "duration_days": 1.0,
        "step_minutes": 60.0,
        "horizon_radius_km": 10.0,
    }
    response = client.post("/api/visibility/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "samples" in data
    assert data["summary"]["total_samples"] == 25
    assert data["summary"]["sunlit_fraction"] >= 0.0


def test_api_continuity_envelope():
    """Verify Mission Continuity Envelope endpoint."""
    payload = {
        "site": {
            "name": "Shackleton Connecting Ridge",
            "latitude_deg": -89.70,
            "longitude_deg": 129.0,
            "elevation_m": 1120.0,
            "slope_deg": 5.0,
            "aspect_deg": 130.0,
        },
        "start_utc": "2026-02-01T00:00:00Z",
        "duration_days": 2.0,
        "step_minutes": 120.0,
        "requirements": {
            "min_continuous_sunlight_hours": 12.0,
            "max_tolerable_dark_hours": 72.0,
            "min_continuous_earth_comms_hours": 6.0,
            "min_simultaneous_operating_hours": 6.0,
        },
    }
    response = client.post("/api/continuity/envelope", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "overall_robustness_score" in data
    assert "perturbations" in data
    assert 0.0 <= data["overall_robustness_score"] <= 1.0
