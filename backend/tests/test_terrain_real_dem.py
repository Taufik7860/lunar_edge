"""
Tests for TerrainEngine with real LOLA South Pole 80m DEM.
"""

import numpy as np
import pytest

from app.engines.terrain_engine import TerrainEngine, DEM_DEFAULT_PATH
from app.engines.horizon_engine import compute_horizon_profile


@pytest.mark.skipif(not DEM_DEFAULT_PATH.exists(), reason="LOLA DEM not downloaded")
def test_terrain_engine_real_dem():
    """Verify loading, elevation queries, and patch extraction on real LOLA GeoTIFF."""
    engine = TerrainEngine()
    meta = engine.load()

    assert meta.n_rows == 7600
    assert meta.n_cols == 7600
    assert abs(meta.pixel_size_x_m - 80.0) < 1e-3

    # Query elevation at Shackleton Connecting Ridge (-89.70° lat, 129.0° lon)
    elev = engine.get_elevation(-89.70, 129.0)
    # Shackleton ridge is elevated rim topography (~1000m to 1500m)
    assert isinstance(elev, float)
    assert not np.isnan(elev)

    # Extract 10 km patch around Shackleton
    patch = engine.extract_patch(-89.70, 129.0, radius_km=10.0)
    assert patch.elevation_m.shape[0] > 100
    assert patch.elevation_m.shape[1] > 100
    assert patch.observer_elevation_m == pytest.approx(elev, abs=10.0)

    # Compute real terrain horizon profile (72 azimuth bins = 5° resolution for speed)
    horizon = compute_horizon_profile(patch, n_azimuths=72, min_range_m=100.0)
    assert len(horizon) == 72
    # Rim horizon should be bounded in physically sensible range (-5° to +45°)
    assert np.all(horizon >= -5.0)
    assert np.all(horizon <= 45.0)
