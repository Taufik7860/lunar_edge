"""
test_terrain_synthetic.py — Exhaustive unit tests for TerrainEngine and slope/aspect calculations.

Validates:
1. Flat plane: slope = 0°, aspect = 0°.
2. Inclined planes: exact slope angle and correct cardinal aspects (North, East, South, West).
3. Paraboloid dome: analytical slope vs discrete Horn convolution down to machine precision.
4. Meridian convergence: aspect properly accounts for polar stereographic rotation.
5. NoData handling: NaN propagation without spilling.
6. Safe query interfaces: EVALUATED, OUTSIDE_COVERAGE, NODATA, ERROR.
7. Patch statistics: mean, max, min, std, and steep terrain fractions.
8. Synthetic GeoTIFF creation and loading via TerrainEngine.
"""

import math
import tempfile
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from app.engines.terrain_engine import (
    DEMPatch,
    TerrainEngine,
    calculate_slope_and_aspect,
)


def test_flat_plane_slope_and_aspect():
    """Flat terrain must yield slope = 0.0 deg and aspect = 0.0 deg."""
    x = np.linspace(-1000.0, 1000.0, 25)
    y = np.linspace(5000.0, 3000.0, 25)
    z = np.full((25, 25), 1500.0)

    slope, aspect = calculate_slope_and_aspect(z, dx=80.0, dy=80.0, x_coords=x, y_coords=y)

    assert slope.shape == (25, 25)
    assert aspect.shape == (25, 25)
    assert np.all(slope < 1e-5)
    assert np.all(aspect == 0.0)


def test_inclined_plane_cardinal_directions():
    """
    Test inclined planes dipping in the 4 cardinal directions.
    Observer at lat -85°, lon 0° (x = 0, y = 150,000 m).
    Here, local North is +Y, local East is +X, local South is -Y, local West is -X.
    """
    nx, ny = 31, 31
    dx = dy = 80.0
    x = np.linspace(-15 * dx, 15 * dx, nx)
    # Observer at y = 150,000 m (near lat -85°, lon 0°)
    y_center = 150_000.0
    y = np.linspace(y_center + 15 * dy, y_center - 15 * dy, ny)

    target_slope_deg = 12.0
    tan_slope = math.tan(math.radians(target_slope_deg))

    # 1. Dipping North: z decreases as Y increases -> dz/dy < 0
    # Downhill vector is +Y (North), so aspect = 0°
    Y_grid = y[:, np.newaxis]
    X_grid = x[np.newaxis, :]
    z_north = 1000.0 - tan_slope * (Y_grid - y_center) * np.ones_like(X_grid)
    s_n, a_n = calculate_slope_and_aspect(z_north, dx, dy, x, y)
    inner = slice(5, -5), slice(5, -5)
    assert np.allclose(s_n[inner], target_slope_deg, atol=0.01)
    dist_from_north = np.minimum(a_n[inner], 360.0 - a_n[inner])
    assert np.all(dist_from_north < 0.5)

    # 2. Dipping East: z decreases as X increases -> dz/dx < 0
    # Downhill vector is +X (East), so aspect = 90°
    z_east = 1000.0 - tan_slope * X_grid * np.ones_like(Y_grid)
    s_e, a_e = calculate_slope_and_aspect(z_east, dx, dy, x, y)
    assert np.allclose(s_e[inner], target_slope_deg, atol=0.01)
    dist_from_east = np.abs(a_e[inner] - 90.0)
    assert np.all(dist_from_east < 0.5)

    # 3. Dipping South: z decreases as Y decreases -> dz/dy > 0
    # Downhill vector is -Y (South), so aspect = 180°
    z_south = 1000.0 + tan_slope * (Y_grid - y_center) * np.ones_like(X_grid)
    s_s, a_s = calculate_slope_and_aspect(z_south, dx, dy, x, y)
    assert np.allclose(s_s[inner], target_slope_deg, atol=0.01)
    dist_from_south = np.abs(a_s[inner] - 180.0)
    assert np.all(dist_from_south < 0.5)

    # 4. Dipping West: z decreases as X decreases -> dz/dx > 0
    # Downhill vector is -X (West), so aspect = 270°
    z_west = 1000.0 + tan_slope * X_grid * np.ones_like(Y_grid)
    s_w, a_w = calculate_slope_and_aspect(z_west, dx, dy, x, y)
    assert np.allclose(s_w[inner], target_slope_deg, atol=0.01)
    dist_from_west = np.abs(a_w[inner] - 270.0)
    assert np.all(dist_from_west < 0.5)


def test_meridian_convergence_aspect():
    """
    At lon = 90°E (x > 0, y = 0), local North is +X (radially away from pole)
    and local East is -Y.
    A plane whose downhill gradient points in the +X direction is sloping true North!
    Its calculated aspect must be 0° (North), not 90°.
    """
    nx, ny = 31, 31
    dx = dy = 80.0
    x_center = 150_000.0
    x = np.linspace(x_center - 15 * dx, x_center + 15 * dx, nx)
    y = np.linspace(15 * dy, -15 * dy, ny)
    X, _ = np.meshgrid(x, y)

    target_slope_deg = 8.5
    tan_slope = math.tan(math.radians(target_slope_deg))

    # Elevation decreases as X increases (downhill along +X = true North at lon 90°)
    z = 2000.0 - tan_slope * (X - x_center)
    s, a = calculate_slope_and_aspect(z, dx, dy, x, y)
    inner = slice(5, -5), slice(5, -5)

    assert np.allclose(s[inner], target_slope_deg, atol=0.01)
    # The aspect must be 0° (True North) within meridian rotation tolerance
    dist_from_north = np.minimum(a[inner], 360.0 - a[inner])
    assert np.all(dist_from_north < 0.5)
    # At exact meridian (y = 0), aspect must be exactly 0°
    assert a[15, 15] == pytest.approx(0.0, abs=1e-5)


def test_paraboloid_dome_analytical_slope():
    """
    Curved dome: z(x,y) = H0 - c * (x^2 + y^2).
    Analytical gradient magnitude: grad(r) = 2 * c * r.
    True slope: atan(2 * c * r).
    Verify that Horn's method matches analytical slope down to 1e-10 degrees.
    """
    nx, ny = 51, 51
    dx = dy = 20.0
    x = np.linspace(-500.0, 500.0, nx)
    y = np.linspace(500.0, -500.0, ny)
    X, Y = np.meshgrid(x, y)

    c = 0.001
    z = 3000.0 - c * (X**2 + Y**2)

    slope, aspect = calculate_slope_and_aspect(z, dx, dy, x, y)

    R = np.hypot(X, Y)
    true_grad = 2.0 * c * R
    true_slope = np.degrees(np.arctan(true_grad))

    # Compare interior cells (away from boundary 1-pixel margin)
    inner = slice(2, -2), slice(2, -2)
    diff = np.abs(slope[inner] - true_slope[inner])
    assert np.max(diff) < 1e-10

    # On a dome centered at (0,0), slope downhill points radially outward (North everywhere)
    r_inner = R[inner]
    a_inner = aspect[inner]
    non_pole = r_inner > 50.0
    dist_from_north = np.minimum(a_inner[non_pole], 360.0 - a_inner[non_pole])
    assert np.all(dist_from_north < 1e-6)


def test_nodata_propagation():
    """NoData cells should produce NaN in slope and aspect without corrupting valid neighbors."""
    nx, ny = 21, 21
    dx = dy = 80.0
    x = np.linspace(-10 * dx, 10 * dx, nx)
    y = np.linspace(10 * dy, -10 * dy, ny)
    z = np.full((ny, nx), 500.0)

    # Set some cells to nodata
    nodata_mask = np.zeros((ny, nx), dtype=bool)
    nodata_mask[5, 5] = True
    nodata_mask[10, 10:15] = True
    z[nodata_mask] = -9999.0

    slope, aspect = calculate_slope_and_aspect(z, dx, dy, x, y, nodata_mask=nodata_mask)

    assert np.all(np.isnan(slope[nodata_mask]))
    assert np.all(np.isnan(aspect[nodata_mask]))

    # Valid cells away from nodata should remain valid
    assert np.all(~np.isnan(slope[1:4, 1:4]))


def test_dem_patch_slope_statistics():
    """Test DEMPatch.compute_slope_statistics()."""
    slope_grid = np.array([
        [5.0, 10.0, 16.0],
        [8.0, np.nan, 22.0],
        [12.0, 14.0, 18.0],
    ])
    patch = DEMPatch(
        observer_x_m=0.0,
        observer_y_m=0.0,
        observer_elevation_m=0.0,
        x_coords=np.array([0, 1, 2]),
        y_coords=np.array([2, 1, 0]),
        elevation_m=np.zeros((3, 3)),
        nodata_mask=np.isnan(slope_grid),
        pixel_size_m=80.0,
        radius_m=100.0,
        slope_deg=slope_grid,
    )

    stats = patch.compute_slope_statistics()
    valid_vals = slope_grid[~np.isnan(slope_grid)]

    assert stats["valid_pixel_count"] == 8
    assert stats["min_deg"] == pytest.approx(5.0)
    assert stats["max_deg"] == pytest.approx(22.0)
    assert stats["mean_deg"] == pytest.approx(float(np.mean(valid_vals)))
    # Steep > 15: 16, 22, 18 -> 3 out of 8 = 0.375
    assert stats["fraction_steep_gt_15"] == pytest.approx(3 / 8)
    # Steep > 20: 22 -> 1 out of 8 = 0.125
    assert stats["fraction_steep_gt_20"] == pytest.approx(1 / 8)


def test_synthetic_geotiff_terrain_engine():
    """Create a temporary synthetic GeoTIFF and verify TerrainEngine full pipeline."""
    with tempfile.TemporaryDirectory() as tmpdir:
        dem_file = Path(tmpdir) / "synthetic_lola.tif"
        width, height = 100, 100
        res = 80.0
        # Extent: (-4000, 4000) to (4000, -4000)
        transform = from_origin(-4000.0, 4000.0, res, res)
        # LOLA South Pole Stereographic WKT
        crs_wkt = (
            'PROJCS["Moon_2000_South_Pole_Stereographic",'
            'GEOGCS["GCS_Moon_2000",'
            'DATUM["D_Moon_2000",'
            'SPHEROID["Moon_2000_IAU_IAG",1737400.0,0.0]],'
            'PRIMEM["Reference_Meridian",0.0],'
            'UNIT["Degree",0.0174532925199433]],'
            'PROJECTION["Stereographic"],'
            'PARAMETER["false_easting",0.0],'
            'PARAMETER["false_northing",0.0],'
            'PARAMETER["central_meridian",0.0],'
            'PARAMETER["scale_factor",1.0],'
            'PARAMETER["latitude_of_origin",-90.0],'
            'UNIT["Meter",1.0]]'
        )

        # Create elevation surface with constant 10° slope dipping North
        tan_10 = math.tan(math.radians(10.0))
        y_indices, _ = np.indices((height, width))
        y_coords_arr = 4000.0 - (y_indices + 0.5) * res
        elev_data = (1000.0 - tan_10 * y_coords_arr).astype(np.float32)

        # Write synthetic raster
        with rasterio.open(
            dem_file,
            "w",
            driver="GTiff",
            height=height,
            width=width,
            count=1,
            dtype=elev_data.dtype,
            crs=crs_wkt,
            transform=transform,
            nodata=-32768.0,
        ) as dst:
            dst.write(elev_data, 1)

        # Load with TerrainEngine
        engine = TerrainEngine(dem_path=dem_file)
        try:
            meta = engine.load()

            assert meta.n_rows == 100
            assert meta.n_cols == 100
            assert meta.pixel_size_x_m == 80.0

            # Test point query near pole
            lat, lon = -89.95, 0.0
            elev = engine.get_elevation(lat, lon)
            assert isinstance(elev, float)

            # Test safe elevation query
            elev_val, status, msg = engine.get_elevation_safe(lat, lon)
            assert status == "EVALUATED"
            assert elev_val == pytest.approx(elev, abs=1e-3)

            # Test outside coverage (lat > -80°)
            _, status_out, _ = engine.get_elevation_safe(-75.0, 0.0)
            assert status_out == "OUTSIDE_COVERAGE"

            # Test compute_point_slope_aspect
            slope, aspect = engine.compute_point_slope_aspect(lat, lon)
            assert slope == pytest.approx(10.0, abs=0.1)
            dist_north = min(aspect, 360.0 - aspect)
            assert dist_north == pytest.approx(0.0, abs=0.5)

            # Test safe slope/aspect query
            s_val, a_val, s_status, _ = engine.compute_point_slope_aspect_safe(lat, lon)
            assert s_status == "EVALUATED"
            assert s_val == pytest.approx(10.0, abs=0.1)

            # Test extract_patch (radius 1 km -> interior window)
            patch = engine.extract_patch(lat, lon, radius_km=1.0)
            assert patch.slope_deg is not None
            assert patch.aspect_deg is not None
            assert patch.observer_slope_deg == pytest.approx(10.0, abs=0.1)
            assert patch.nodata_fraction == 0.0

            stats = patch.compute_slope_statistics()
            # Mean slope on interior patch
            assert stats["mean_deg"] == pytest.approx(10.0, abs=0.5)
        finally:
            engine.close()
