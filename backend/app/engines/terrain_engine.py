"""
terrain_engine.py — LUNAR EDGE Phase 3

Loads the LOLA 80m/pix South Pole GeoTIFF and provides:
  - DEM metadata extraction
  - Coordinate conversion: selenographic ↔ LOLA Polar Stereographic ↔ pixel (row, col)
  - Elevation lookup with bilinear interpolation
  - Slope and aspect computation via Horn's (1981) finite-difference method with meridian convergence correction
  - Local DEM patch extraction for horizon calculations
  - Explicit nodata handling (never silent fill)
  - Safe evaluation methods distinguishing EVALUATED, OUTSIDE_COVERAGE, NODATA, and ERROR

DEM product: LDEM_80S_80MPP_ADJ.TIF
  Source: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF
  CRS: PROJCS "Moon_2000_South_Pole_Stereographic"
       Stereographic at -90°, central meridian 0°
       Spheroid: R = 1,737,400 m (sphere, 1/f = 0)
  Pixel size: ~80 m/pix
  Coverage: ~80°S to 90°S
  Elevation units: metres above IAU Moon 2000 reference sphere (R = 1,737,400 m)
  Nodata: typically -32768 or defined in GeoTIFF metadata

Scientific note:
  Elevations are referenced to the IAU 2000 mean sphere (R = 1,737,400 m),
  NOT the geoid or a gravitational datum. For geometry calculations
  that require absolute MOON_ME Cartesian positions, add this radius.
"""

from __future__ import annotations

import logging
import math
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import rasterio
import rasterio.windows
from pyproj import CRS, Transformer
from rasterio.transform import rowcol
from scipy.ndimage import correlate

from app.utils.coordinate_utils import (
    selenographic_to_polar_stereo as coord_sel_to_ps,
    polar_stereo_to_selenographic as coord_ps_to_sel,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MOON_RADIUS_M = 1_737_400.0          # IAU 2000 mean sphere radius [m]
MOON_RADIUS_KM = MOON_RADIUS_M / 1000.0

# DEM file location (relative to this file: backend/app/engines/ → backend/)
_THIS_DIR = Path(__file__).parent
_BACKEND_DIR = _THIS_DIR.parent.parent
DEM_DEFAULT_PATH = _BACKEND_DIR / "data" / "raw" / "lola" / "LDEM_80S_80MPP_ADJ.TIF"


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class DEMMetadata:
    """Extracted metadata from the LOLA GeoTIFF."""
    path: Path
    crs_wkt: str
    pixel_size_x_m: float          # metres per pixel in X direction
    pixel_size_y_m: float          # metres per pixel in Y direction (usually negative)
    n_rows: int
    n_cols: int
    nodata_value: Optional[float]
    transform: object              # rasterio Affine transform
    bounds_polar_stereo_m: Tuple[float, float, float, float]  # (left, bottom, right, top) in PS metres
    elevation_min_m: float
    elevation_max_m: float


@dataclass
class DEMPatch:
    """
    A rectangular patch of DEM data centred on a surface point.

    Coordinate frame:
      x_coords, y_coords — Polar Stereographic metres (LOLA CRS)
      elevation_m — metres above IAU Moon sphere

    Nodata mask: True where elevation is invalid / no-data.
    """
    observer_x_m: float            # PS coords of the observer / centre point
    observer_y_m: float
    observer_elevation_m: float    # interpolated elevation at observer

    x_coords: np.ndarray           # shape (n_cols,) in PS metres
    y_coords: np.ndarray           # shape (n_rows,) in PS metres  (N→S, so y_coords[0] > y_coords[-1])
    elevation_m: np.ndarray        # shape (n_rows, n_cols)
    nodata_mask: np.ndarray        # bool (n_rows, n_cols), True = invalid

    pixel_size_m: float            # representative pixel size for this patch
    radius_m: float                # requested radius from centre
    observer_lat_deg: float = -90.0
    observer_lon_deg: float = 0.0

    slope_deg: Optional[np.ndarray] = None    # shape (n_rows, n_cols) [degrees]
    aspect_deg: Optional[np.ndarray] = None   # shape (n_rows, n_cols) [degrees from true North]
    observer_slope_deg: float = 0.0           # slope at observer location [deg]
    observer_aspect_deg: float = 0.0          # aspect at observer location [deg]
    observer_is_nodata: bool = False
    nodata_fraction: float = 0.0              # fraction of nodata cells in patch [0.0 - 1.0]

    def compute_slope_statistics(self) -> dict:
        """
        Compute statistical summary of terrain slope across valid cells in the patch.
        Returns dictionary with mean, max, min, std, and fraction of steep terrain.
        """
        if self.slope_deg is None:
            return {
                "mean_deg": 0.0,
                "max_deg": 0.0,
                "min_deg": 0.0,
                "std_deg": 0.0,
                "fraction_steep_gt_15": 0.0,
                "fraction_steep_gt_20": 0.0,
                "valid_pixel_count": 0,
            }
        valid = ~np.isnan(self.slope_deg)
        if not np.any(valid):
            return {
                "mean_deg": 0.0,
                "max_deg": 0.0,
                "min_deg": 0.0,
                "std_deg": 0.0,
                "fraction_steep_gt_15": 0.0,
                "fraction_steep_gt_20": 0.0,
                "valid_pixel_count": 0,
            }
        vals = self.slope_deg[valid]
        return {
            "mean_deg": float(np.mean(vals)),
            "max_deg": float(np.max(vals)),
            "min_deg": float(np.min(vals)),
            "std_deg": float(np.std(vals)),
            "fraction_steep_gt_15": float(np.mean(vals > 15.0)),
            "fraction_steep_gt_20": float(np.mean(vals > 20.0)),
            "valid_pixel_count": int(np.sum(valid)),
        }


# ---------------------------------------------------------------------------
# Slope & Aspect Calculation (Horn 1981 + Meridian Convergence)
# ---------------------------------------------------------------------------

def calculate_slope_and_aspect(
    elevation_grid: np.ndarray,
    dx: float,
    dy: float,
    x_coords: np.ndarray,
    y_coords: np.ndarray,
    nodata_mask: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute slope [degrees] and aspect [degrees from true North] for a 2D DEM grid.

    Methodology:
      - Horn (1981) 3x3 finite-difference weighting kernel.
      - Grid coordinates in LOLA South Pole Stereographic (metres).
      - Meridian convergence projection: aspect is projected onto the local topocentric
        North and East unit vectors, returning true selenographic azimuth [0, 360) clockwise.
      - Explicit nodata propagation: nodata cells yield NaN for slope and aspect.
    """
    elev = elevation_grid.astype(np.float64)
    if nodata_mask is not None:
        elev_clean = np.where(nodata_mask, np.nan, elev)
        nan_mask = np.isnan(elev_clean)
        if np.all(nan_mask):
            return np.full_like(elev, np.nan), np.full_like(elev, np.nan)
        mean_val = float(np.nanmean(elev_clean))
        elev_conv = np.where(nan_mask, mean_val, elev_clean)
    else:
        elev_conv = elev

    dx_abs = abs(float(dx))
    dy_abs = abs(float(dy))
    if dx_abs <= 0.0 or dy_abs <= 0.0:
        raise ValueError(f"Pixel sizes dx ({dx}) and dy ({dy}) must be positive non-zero.")

    # Horn (1981) kernels for 3x3 grid
    # For dz/dx (x increases with column index):
    K_x = np.array([[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]], dtype=np.float64) / (8.0 * dx_abs)
    # For dz/dy (y decreases with row index in standard North-up rasters):
    K_y = np.array([[1.0, 2.0, 1.0], [0.0, 0.0, 0.0], [-1.0, -2.0, -1.0]], dtype=np.float64) / (8.0 * dy_abs)

    dz_dx = correlate(elev_conv, K_x, mode="nearest")
    dz_dy = correlate(elev_conv, K_y, mode="nearest")

    grad = np.hypot(dz_dx, dz_dy)
    slope_deg = np.degrees(np.arctan(grad))

    # Downhill vector (steepest descent)
    vx = -dz_dx
    vy = -dz_dy

    # Local topocentric North and East unit vectors in Polar Stereographic
    X, Y = np.meshgrid(x_coords, y_coords)
    R = np.hypot(X, Y)

    # South pole singularity handling (r < 0.1 m): default North to +Y (0 deg meridian), East to +X
    pole_mask = R < 1e-4
    R_safe = np.where(pole_mask, 1.0, R)
    u_north_x = np.where(pole_mask, 0.0, X / R_safe)
    u_north_y = np.where(pole_mask, 1.0, Y / R_safe)
    u_east_x = np.where(pole_mask, 1.0, Y / R_safe)
    u_east_y = np.where(pole_mask, 0.0, -X / R_safe)

    # Project downhill gradient onto local North and East
    d_north = vx * u_north_x + vy * u_north_y
    d_east = vx * u_east_x + vy * u_east_y

    # Azimuth clockwise from North: 0° = North, 90° = East, 180° = South, 270° = West
    aspect_deg = np.degrees(np.arctan2(d_east, d_north)) % 360.0

    # Flat ground has undefined aspect; convention is 0.0
    aspect_deg[grad < 1e-6] = 0.0
    # Clean up numerical wrap-around near 360.0
    aspect_deg[np.isclose(aspect_deg, 360.0)] = 0.0

    if nodata_mask is not None:
        slope_deg[nodata_mask] = np.nan
        aspect_deg[nodata_mask] = np.nan

    return slope_deg, aspect_deg


# ---------------------------------------------------------------------------
# Transformer cache (built once per session)
# ---------------------------------------------------------------------------

_crs_cache: dict = {}


def _build_transformers(crs_wkt: str):
    """
    Build and cache pyproj Transformers between selenographic and PS coords.

    Returns (sel_to_ps, ps_to_sel) where:
      sel_to_ps: (lon_deg, lat_deg) → (x_m, y_m)
      ps_to_sel: (x_m, y_m) → (lon_deg, lat_deg)
    """
    if crs_wkt in _crs_cache:
        return _crs_cache[crs_wkt]

    ps_crs = CRS.from_wkt(crs_wkt)
    geo_crs = ps_crs.geodetic_crs   # selenographic lon/lat on Moon sphere

    sel_to_ps = Transformer.from_crs(geo_crs, ps_crs, always_xy=True)
    ps_to_sel = Transformer.from_crs(ps_crs, geo_crs, always_xy=True)

    _crs_cache[crs_wkt] = (sel_to_ps, ps_to_sel)
    return sel_to_ps, ps_to_sel


# ---------------------------------------------------------------------------
# TerrainEngine
# ---------------------------------------------------------------------------

class TerrainEngine:
    """
    Loads the LOLA DEM GeoTIFF and provides elevation queries, slope/aspect
    calculations, and patch extraction.

    Usage::

        engine = TerrainEngine()
        engine.load()
        elev = engine.get_elevation(lat_deg=-89.45, lon_deg=0.0)
        slope, aspect = engine.compute_point_slope_aspect(lat_deg=-89.45, lon_deg=0.0)
        patch = engine.extract_patch(lat_deg=-89.45, lon_deg=0.0, radius_km=10.0)
    """

    def __init__(self, dem_path: Optional[Path] = None):
        self._path = Path(dem_path) if dem_path else DEM_DEFAULT_PATH
        self._dataset: Optional[rasterio.DatasetReader] = None
        self._meta: Optional[DEMMetadata] = None
        self._sel_to_ps: Optional[Transformer] = None
        self._ps_to_sel: Optional[Transformer] = None
        self._data: Optional[np.ndarray] = None   # full DEM array (lazy loaded on first use)
        self._io_lock = threading.RLock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load(self) -> DEMMetadata:
        """
        Open the GeoTIFF and extract metadata. Actual pixel data is NOT
        loaded into memory here (use extract_patch for that).
        """
        with self._io_lock:
            if self._meta is not None:
                return self._meta

            if not self._path.exists():
                raise FileNotFoundError(
                    f"LOLA DEM not found at {self._path}. "
                    f"Download it with: curl.exe -L -o {self._path} "
                    f"https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF"
                )

            logger.info("Opening LOLA DEM: %s", self._path)
            self._dataset = rasterio.open(self._path)

            ds = self._dataset
            tfm = ds.transform
            crs_wkt = ds.crs.wkt

            # Build transformers
            self._sel_to_ps, self._ps_to_sel = _build_transformers(crs_wkt)

            # Bounds in PS metres
            bounds = ds.bounds  # left, bottom, right, top in CRS units (metres)

            # Quick elevation range from metadata tags if available; otherwise defer
            try:
                stat_fn = getattr(ds, "stats", getattr(ds, "statistics", None))
                stats = stat_fn(1) if stat_fn else None
                elev_min = float(stats.min) if stats else float("nan")
                elev_max = float(stats.max) if stats else float("nan")
            except Exception:
                elev_min = float("nan")
                elev_max = float("nan")

            self._meta = DEMMetadata(
                path=self._path,
                crs_wkt=crs_wkt,
                pixel_size_x_m=abs(tfm.a),
                pixel_size_y_m=abs(tfm.e),
                n_rows=ds.height,
                n_cols=ds.width,
                nodata_value=ds.nodata,
                transform=tfm,
                bounds_polar_stereo_m=(bounds.left, bounds.bottom, bounds.right, bounds.top),
                elevation_min_m=elev_min,
                elevation_max_m=elev_max,
            )

            logger.info(
                "DEM loaded: %d×%d pixels, %.1f m/pix, nodata=%s",
                self._meta.n_cols,
                self._meta.n_rows,
                self._meta.pixel_size_x_m,
                self._meta.nodata_value,
            )
            return self._meta

    @property
    def metadata(self) -> DEMMetadata:
        self._require_loaded()
        return self._meta

    def selenographic_to_polar_stereo(self, lat_deg: float, lon_deg: float) -> Tuple[float, float]:
        """
        Convert selenographic (lat, lon) → LOLA Polar Stereographic (x_m, y_m).

        Args:
            lat_deg: Selenographic latitude  [-90, 90]
            lon_deg: Selenographic longitude [-180, 180]

        Returns:
            (x_m, y_m) in LOLA Polar Stereographic metres
        """
        if self._sel_to_ps is not None:
            x, y = self._sel_to_ps.transform(lon_deg, lat_deg)
            return float(x), float(y)
        # Fallback to standard projection without requiring DEM file open
        return coord_sel_to_ps(lon_deg, lat_deg)

    def polar_stereo_to_selenographic(self, x_m: float, y_m: float) -> Tuple[float, float]:
        """
        Convert LOLA Polar Stereographic (x_m, y_m) → selenographic (lat_deg, lon_deg).
        """
        if self._ps_to_sel is not None:
            lon, lat = self._ps_to_sel.transform(x_m, y_m)
            return float(lat), float(lon)
        # Fallback to standard projection without requiring DEM file open
        lon, lat = coord_ps_to_sel(x_m, y_m)
        return float(lat), float(lon)

    def polar_stereo_to_pixel(self, x_m: float, y_m: float) -> Tuple[float, float]:
        """
        Convert PS (x_m, y_m) → fractional pixel (row, col).
        Uses the GeoTIFF affine transform (rasterio convention).
        """
        self._require_loaded()
        row, col = rowcol(self._meta.transform, x_m, y_m, op=float)
        return float(row), float(col)

    def get_elevation(self, lat_deg: float, lon_deg: float) -> float:
        """
        Return bilinearly-interpolated elevation [m] at the given selenographic location.

        Raises:
            ValueError: if the point is outside the DEM extent.
            RuntimeError: if all surrounding pixels are nodata.
        """
        self._require_loaded()
        x_m, y_m = self.selenographic_to_polar_stereo(lat_deg, lon_deg)
        return self._bilinear_elevation(x_m, y_m)

    def get_elevation_safe(
        self, lat_deg: float, lon_deg: float
    ) -> Tuple[Optional[float], str, str]:
        """
        Safely query elevation, returning (elevation_m, status, message).
        Status is one of 'EVALUATED', 'OUTSIDE_COVERAGE', 'NODATA', 'ERROR'.
        """
        if lat_deg > -80.0:
            return (
                None,
                "OUTSIDE_COVERAGE",
                f"Latitude {lat_deg:.4f}° is north of -80°S (LOLA 80m South Polar DEM coverage limit).",
            )
        try:
            elev = self.get_elevation(lat_deg, lon_deg)
            return elev, "EVALUATED", "Elevation evaluated from LOLA 80m DEM."
        except ValueError as e:
            return None, "OUTSIDE_COVERAGE", str(e)
        except RuntimeError as e:
            return None, "NODATA", str(e)
        except Exception as e:
            return None, "ERROR", f"Unexpected error querying elevation: {e}"

    def compute_point_slope_aspect(self, lat_deg: float, lon_deg: float) -> Tuple[float, float]:
        """
        Compute local terrain slope [degrees] and aspect [degrees from true North] at a point.

        Raises:
            ValueError: if point is north of -80°S or outside DEM extent.
            RuntimeError: if surrounding DEM cells are nodata.
        """
        self._require_loaded()
        if lat_deg > -80.0:
            raise ValueError(
                f"Latitude {lat_deg:.4f}° is north of -80°S (LOLA 80m South Polar DEM coverage limit)."
            )

        x_m, y_m = self.selenographic_to_polar_stereo(lat_deg, lon_deg)
        ds = self._dataset
        tfm = self._meta.transform

        col_f, row_f = ~tfm @ (x_m, y_m)
        c_center = int(round(col_f))
        r_center = int(round(row_f))

        # Check interior bounds
        if c_center < 1 or c_center >= self._meta.n_cols - 1 or r_center < 1 or r_center >= self._meta.n_rows - 1:
            raise ValueError(
                f"Point ({lat_deg:.4f}°, {lon_deg:.4f}°) is outside the DEM interior extent."
            )

        window = rasterio.windows.Window(col_off=c_center - 1, row_off=r_center - 1, width=3, height=3)
        with self._io_lock:
            raw = ds.read(1, window=window).astype(np.float64)

        nodata = self._meta.nodata_value
        if nodata is not None:
            mask = (raw == nodata) | ~np.isfinite(raw)
        else:
            mask = (raw < -10000) | ~np.isfinite(raw)

        if mask[1, 1] or np.sum(~mask) < 5:
            raise RuntimeError(
                f"DEM cells surrounding ({lat_deg:.4f}°, {lon_deg:.4f}°) contain insufficient valid data."
            )

        # Local fill for masked pixels
        clean_raw = raw.copy()
        if np.any(mask):
            clean_raw[mask] = np.nanmean(clean_raw[~mask])

        dx = abs(self._meta.pixel_size_x_m)
        dy = abs(self._meta.pixel_size_y_m)

        # Horn 3x3 finite differences
        dz_dx = ((clean_raw[0, 2] + 2.0 * clean_raw[1, 2] + clean_raw[2, 2]) -
                 (clean_raw[0, 0] + 2.0 * clean_raw[1, 0] + clean_raw[2, 0])) / (8.0 * dx)
        dz_dy = ((clean_raw[0, 0] + 2.0 * clean_raw[0, 1] + clean_raw[0, 2]) -
                 (clean_raw[2, 0] + 2.0 * clean_raw[2, 1] + clean_raw[2, 2])) / (8.0 * dy)

        grad = math.hypot(dz_dx, dz_dy)
        slope_deg = math.degrees(math.atan(grad))

        vx = -dz_dx
        vy = -dz_dy

        r = math.hypot(x_m, y_m)
        if r < 1e-4:
            u_north_x, u_north_y = 0.0, 1.0
            u_east_x, u_east_y = 1.0, 0.0
        else:
            u_north_x, u_north_y = x_m / r, y_m / r
            u_east_x, u_east_y = y_m / r, -x_m / r

        d_north = vx * u_north_x + vy * u_north_y
        d_east = vx * u_east_x + vy * u_east_y

        aspect_deg = math.degrees(math.atan2(d_east, d_north)) % 360.0
        if grad < 1e-6 or math.isclose(aspect_deg, 360.0, abs_tol=1e-5):
            aspect_deg = 0.0

        return float(slope_deg), float(aspect_deg)

    def compute_point_slope_aspect_safe(
        self, lat_deg: float, lon_deg: float
    ) -> Tuple[Optional[float], Optional[float], str, str]:
        """
        Safely compute slope and aspect, returning (slope_deg, aspect_deg, status, message).
        Status is one of 'EVALUATED', 'OUTSIDE_COVERAGE', 'NODATA', 'ERROR'.
        """
        if lat_deg > -80.0:
            return (
                None,
                None,
                "OUTSIDE_COVERAGE",
                f"Latitude {lat_deg:.4f}° is north of -80°S (LOLA 80m South Polar DEM coverage limit).",
            )
        try:
            slope, aspect = self.compute_point_slope_aspect(lat_deg, lon_deg)
            return slope, aspect, "EVALUATED", "Slope and aspect evaluated from LOLA 80m DEM."
        except ValueError as e:
            return None, None, "OUTSIDE_COVERAGE", str(e)
        except RuntimeError as e:
            return None, None, "NODATA", str(e)
        except Exception as e:
            return None, None, "ERROR", f"Unexpected error computing slope/aspect: {e}"

    def extract_patch(
        self,
        lat_deg: float,
        lon_deg: float,
        radius_km: float,
    ) -> DEMPatch:
        """
        Extract a square DEM patch centred on (lat_deg, lon_deg).

        Args:
            lat_deg: Observer selenographic latitude.
            lon_deg: Observer selenographic longitude.
            radius_km: Half-width of the patch [km].

        Returns:
            DEMPatch with elevation, slope, and aspect grids in Polar Stereographic coords.

        Raises:
            ValueError: if the point is outside the DEM extent.
        """
        self._require_loaded()
        ds = self._dataset

        radius_m = radius_km * 1000.0
        cx_m, cy_m = self.selenographic_to_polar_stereo(lat_deg, lon_deg)

        # Quick boundary sanity check (LOLA 80m South Polar DEM extent ~ ±304,000 m)
        bounds = self._meta.bounds_polar_stereo_m
        if (cx_m < bounds[0] - radius_m or cx_m > bounds[2] + radius_m or
                cy_m < bounds[1] - radius_m or cy_m > bounds[3] + radius_m or
                lat_deg > -78.0):
            raise ValueError(
                f"Patch for ({lat_deg:.4f}°, {lon_deg:.4f}°) with radius {radius_km} km "
                f"is outside the DEM extent."
            )

        # Bounding box in PS metres
        x_min = cx_m - radius_m
        x_max = cx_m + radius_m
        y_min = cy_m - radius_m
        y_max = cy_m + radius_m

        # Convert to pixel window
        tfm = self._meta.transform
        col_min, row_min = ~tfm @ (x_min, y_max)   # top-left → smallest row, col
        col_max, row_max = ~tfm @ (x_max, y_min)   # bottom-right

        col_off = int(math.floor(col_min))
        row_off = int(math.floor(row_min))
        width = int(math.ceil(col_max)) - col_off + 1
        height = int(math.ceil(row_max)) - row_off + 1

        if width <= 0 or height <= 0:
            raise ValueError(
                f"Invalid patch window dimensions ({width}x{height}) for ({lat_deg:.4f}°, {lon_deg:.4f}°)."
            )

        window = rasterio.windows.Window(
            col_off=col_off,
            row_off=row_off,
            width=width,
            height=height,
        )

        # Read the window (band 1) with thread-safe lock, handling boundaries seamlessly
        with self._io_lock:
            raw = ds.read(1, window=window, boundless=True, fill_value=np.nan).astype(np.float32)

        # Build nodata mask
        nodata = self._meta.nodata_value
        if nodata is not None:
            nodata_mask = (raw == nodata) | ~np.isfinite(raw)
        else:
            nodata_mask = (raw < -10000) | ~np.isfinite(raw)

        elev = raw.copy()
        elev[nodata_mask] = np.nan

        # Build coordinate arrays for the patch cells
        win_tfm = rasterio.windows.transform(window, tfm)
        n_rows_patch, n_cols_patch = raw.shape

        col_indices = np.arange(n_cols_patch)
        row_indices = np.arange(n_rows_patch)
        x_coords = win_tfm.c + (col_indices + 0.5) * win_tfm.a
        y_coords = win_tfm.f + (row_indices + 0.5) * win_tfm.e

        dx = abs(self._meta.pixel_size_x_m)
        dy = abs(self._meta.pixel_size_y_m)
        slope_grid, aspect_grid = calculate_slope_and_aspect(
            elev, dx, dy, x_coords, y_coords, nodata_mask=nodata_mask
        )

        nodata_fraction = float(np.mean(nodata_mask))

        # Observer elevation (bilinear)
        obs_is_nodata = False
        try:
            obs_elev = self._bilinear_elevation(cx_m, cy_m)
        except Exception:
            logger.warning("Observer point has nodata elevation; substituting 0.0 m")
            obs_elev = 0.0
            obs_is_nodata = True

        # Observer slope & aspect
        try:
            obs_slope, obs_aspect = self.compute_point_slope_aspect(lat_deg, lon_deg)
        except Exception:
            # Fallback to patch center cell
            c_idx = n_cols_patch // 2
            r_idx = n_rows_patch // 2
            obs_slope = float(slope_grid[r_idx, c_idx]) if not np.isnan(slope_grid[r_idx, c_idx]) else 0.0
            obs_aspect = float(aspect_grid[r_idx, c_idx]) if not np.isnan(aspect_grid[r_idx, c_idx]) else 0.0

        return DEMPatch(
            observer_x_m=cx_m,
            observer_y_m=cy_m,
            observer_elevation_m=obs_elev,
            x_coords=x_coords,
            y_coords=y_coords,
            elevation_m=elev,
            nodata_mask=nodata_mask,
            pixel_size_m=self._meta.pixel_size_x_m,
            radius_m=radius_m,
            observer_lat_deg=lat_deg,
            observer_lon_deg=lon_deg,
            slope_deg=slope_grid,
            aspect_deg=aspect_grid,
            observer_slope_deg=obs_slope,
            observer_aspect_deg=obs_aspect,
            observer_is_nodata=obs_is_nodata,
            nodata_fraction=nodata_fraction,
        )

    def close(self):
        """Close the rasterio dataset."""
        if self._dataset is not None:
            self._dataset.close()
            self._dataset = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _require_loaded(self):
        if self._meta is None:
            self.load()

    def _bilinear_elevation(self, x_m: float, y_m: float) -> float:
        """
        Bilinear interpolation of elevation at Polar Stereographic (x_m, y_m).

        Raises:
            ValueError: if the point is outside the DEM raster extent.
            RuntimeError: if all four surrounding pixels are nodata.
        """
        ds = self._dataset
        tfm = self._meta.transform

        # Fractional pixel coordinates (top-left origin)
        col_f, row_f = ~tfm @ (x_m, y_m)

        # Surrounding pixel indices
        col0 = int(math.floor(col_f))
        col1 = col0 + 1
        row0 = int(math.floor(row_f))
        row1 = row0 + 1

        # Bounds check
        n_rows = self._meta.n_rows
        n_cols = self._meta.n_cols
        if col0 < 0 or col1 >= n_cols or row0 < 0 or row1 >= n_rows:
            raise ValueError(
                f"PS point ({x_m:.1f}, {y_m:.1f}) m is outside the DEM extent "
                f"({n_cols}×{n_rows} pixels)."
            )

        # Fractional offsets
        dc = col_f - col0
        dr = row_f - row0

        # Read 2×2 window with thread-safe lock
        window = rasterio.windows.Window(col_off=col0, row_off=row0, width=2, height=2)
        with self._io_lock:
            raw = ds.read(1, window=window).astype(np.float64)  # shape (2, 2)

        nodata = self._meta.nodata_value
        if nodata is not None:
            mask = (raw == nodata) | ~np.isfinite(raw)
        else:
            mask = (raw < -10000) | ~np.isfinite(raw)

        raw[mask] = np.nan

        # Weighted bilinear interpolation ignoring nodata cells
        weights = np.array([
            (1 - dr) * (1 - dc),   # top-left    [0,0]
            (1 - dr) * dc,          # top-right   [0,1]
            dr * (1 - dc),          # bottom-left [1,0]
            dr * dc,                # bottom-right[1,1]
        ])
        values = raw.flatten()

        valid = ~np.isnan(values)
        if not np.any(valid):
            raise RuntimeError(
                f"All four DEM pixels surrounding PS ({x_m:.1f}, {y_m:.1f}) m are nodata."
            )

        # Renormalise weights to valid pixels only
        w = weights * valid.astype(float)
        total_w = w.sum()
        return float(np.dot(w, values) / total_w)
