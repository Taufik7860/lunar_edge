"""
LUNAR EDGE — Coordinate & Topocentric Navigation Utilities

Provides mathematically rigorous transformations for the lunar south pole:
1. Selenographic (lat, lon, alt) <-> Cartesian in MOON_ME frame
2. Local Topocentric Horizon Frame (East, North, Zenith)
3. Vector to Azimuth, Elevation, and Range projection with numerical safeguards
4. Polar Stereographic projection (IAU Moon 2000 Sphere, R=1,737,400 m)
"""

import numpy as np
from pyproj import CRS, Transformer

# IAU Moon 2000 reference sphere radius in metres and kilometres
MOON_RADIUS_METERS = 1_737_400.0
MOON_RADIUS_KM = 1_737.4

# NASA LOLA Polar Stereographic South projection
# Conforms to USGS / PDS standards for lunar south pole products
LOLA_POLAR_STEREO_WKT = """PROJCS["Moon_2000_South_Pole_Stereographic",
    GEOGCS["GCS_Moon_2000",
        DATUM["D_Moon_2000",
            SPHEROID["Moon_2000_IAU_IAG",1737400,0]],
        PRIMEM["Reference_Meridian",0],
        UNIT["Degree",0.0174532925199433]],
    PROJECTION["Stereographic"],
    PARAMETER["false_easting",0],
    PARAMETER["false_northing",0],
    PARAMETER["central_meridian",0],
    PARAMETER["scale_factor",1],
    PARAMETER["latitude_of_origin",-90],
    UNIT["Meter",1]]"""

_crs_proj = CRS.from_wkt(LOLA_POLAR_STEREO_WKT)
_crs_geo = _crs_proj.geodetic_crs

_geo_to_polar = Transformer.from_crs(_crs_geo, _crs_proj, always_xy=True)
_polar_to_geo = Transformer.from_crs(_crs_proj, _crs_geo, always_xy=True)


def selenographic_to_polar_stereo(lon_deg: float, lat_deg: float) -> tuple[float, float]:
    """
    Convert Selenographic coordinates to LOLA Polar Stereographic (X, Y) in metres.
    Lon: -180 to +180 or 0 to 360 (East-positive)
    Lat: -90 to 0 (South-negative)
    """
    x, y = _geo_to_polar.transform(lon_deg, lat_deg)
    return float(x), float(y)


def polar_stereo_to_selenographic(x_m: float, y_m: float) -> tuple[float, float]:
    """
    Convert LOLA Polar Stereographic (X, Y in metres) to Selenographic (lon_deg, lat_deg).
    """
    lon, lat = _polar_to_geo.transform(x_m, y_m)
    return float(lon), float(lat)


def selenographic_to_cartesian_moon_me(
    lat_deg: float, lon_deg: float, elevation_m: float = 0.0
) -> np.ndarray:
    """
    Convert Selenographic coordinates (lat, lon, elevation above reference sphere)
    to rectangular (X, Y, Z) in the MOON_ME reference frame in kilometres.
    
    MOON_ME Frame definition (IAU Mean Earth/Polar Axis):
      +Z points along the mean lunar rotation axis (North)
      +X points toward the mean sub-Earth point (lat=0, lon=0)
      +Y completes the right-handed system (+90° East longitude)
    """
    r_km = (MOON_RADIUS_METERS + elevation_m) / 1000.0
    lat_rad = np.radians(lat_deg)
    lon_rad = np.radians(lon_deg)
    
    x = r_km * np.cos(lat_rad) * np.cos(lon_rad)
    y = r_km * np.cos(lat_rad) * np.sin(lon_rad)
    z = r_km * np.sin(lat_rad)
    return np.array([x, y, z], dtype=np.float64)


def compute_topocentric_basis(
    lat_deg: float, lon_deg: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Construct orthonormal basis vectors for the local Topocentric Horizon Frame:
      Zenith (Up), North, East
    all expressed in MOON_ME rectangular coordinates.
    
    Conventions:
      - Up (Zenith): Outward normal from reference sphere
      - North: Horizontal tangent toward the North pole (+Z_MOON_ME)
      - East: Horizontal tangent pointing Eastward (direction of increasing longitude)
      
    Orthonormality guarantee:
      East x North = Up (Right-handed system)
      
    Singularity Handling at South Pole (lat -> -90°):
      At the exact south pole, the outward radial (Zenith) vector is -Z_MOON_ME [0, 0, -1].
      Every horizontal direction points north. By international lunar convention (IAU/NAIF),
      the reference North direction at the south pole is aligned with the projection of
      the prime meridian (toward the Earth / +X_MOON_ME), and East points toward +90°E (+Y_MOON_ME).
    """
    lat_rad = np.radians(lat_deg)
    lon_rad = np.radians(lon_deg)
    
    # Zenith / Up (outward normal from sphere)
    up = np.array([
        np.cos(lat_rad) * np.cos(lon_rad),
        np.cos(lat_rad) * np.sin(lon_rad),
        np.sin(lat_rad)
    ], dtype=np.float64)
    up = up / np.linalg.norm(up)
    
    # Check for polar degeneracy (within 1e-5 degrees of -90°)
    if np.abs(lat_deg - (-90.0)) < 1e-5:
        # At south pole, Up is strictly [0, 0, -1]
        # Reference North points along Prime Meridian (+X direction)
        north = np.array([1.0, 0.0, 0.0], dtype=np.float64)
        east = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    else:
        # East in spherical coordinates: d/d(lon) of position vector
        east = np.array([-np.sin(lon_rad), np.cos(lon_rad), 0.0], dtype=np.float64)
        east = east / np.linalg.norm(east)
        # North is Up x East
        north = np.cross(up, east)
        north = north / np.linalg.norm(north)

    return up, north, east


def vector_to_azel(
    rel_vector_km: np.ndarray,
    up: np.ndarray,
    north: np.ndarray,
    east: np.ndarray,
) -> tuple[float, float, float]:
    """
    Project a relative vector (in MOON_ME Cartesian coordinates) onto the local
    topocentric horizon frame and compute:
      - azimuth_deg: Azimuth angle [0, 360) in degrees, measured clockwise from North.
      - elevation_deg: Elevation angle [-90, +90] in degrees, positive above local horizon.
      - range_km: Distance / magnitude of the vector in kilometres.

    Numerical Safeguards:
      - Zero/degenerate vector handling: If range_km < 1e-9 km (1 mm), returns (0.0, 0.0, 0.0).
      - Clamps u_comp to [-1.0, 1.0] before arcsin to eliminate domain errors from floating-point roundoff.
      - Normalizes azimuth modulo 360.0 to strictly ensure 0.0 <= azimuth_deg < 360.0.
    """
    rel_vec = np.asarray(rel_vector_km, dtype=np.float64)
    range_km = float(np.linalg.norm(rel_vec))

    # Numerical safeguard: zero or sub-millimetre vector
    if range_km < 1e-9:
        return 0.0, 0.0, 0.0

    unit_vec = rel_vec / range_km

    # Project onto topocentric basis vectors
    e_comp = float(np.dot(unit_vec, east))
    n_comp = float(np.dot(unit_vec, north))
    u_comp = float(np.dot(unit_vec, up))

    # Clamp u_comp to [-1.0, 1.0] to prevent IEEE-754 domain errors in arcsin
    u_clamped = max(-1.0, min(1.0, u_comp))
    elevation_deg = float(np.degrees(np.arcsin(u_clamped)))

    # Azimuth clockwise from North: atan2(East, North)
    azimuth_deg = float(np.degrees(np.arctan2(e_comp, n_comp)) % 360.0)

    return azimuth_deg, elevation_deg, range_km


def compute_solar_incidence(
    sun_elevation_deg: float,
    sun_azimuth_deg: float,
    slope_deg: float = 0.0,
    aspect_deg: float = 0.0,
) -> dict:
    """
    Calculate solar incidence angle relative to the local terrain surface.

    Parameters:
      sun_elevation_deg: Sun elevation above horizontal plane in degrees.
      sun_azimuth_deg: Sun azimuth clockwise from North in degrees.
      slope_deg: Terrain slope inclination from horizontal in degrees (0 = flat).
      aspect_deg: Direction the slope faces clockwise from North in degrees.

    Returns dict with:
      - zenith_angle_deg: Sun angle from zenith (90° - elevation)
      - incidence_angle_deg: Angle between sun rays and surface normal in degrees
      - cosine_incidence: cos(incidence), clamped to >= 0 (illumination factor)
      - is_above_geometric_horizon: True if sun_elevation_deg > 0
      - is_surface_illuminated: True if sun is geometrically above the tilted slope
    """
    el_rad = np.radians(sun_elevation_deg)
    az_rad = np.radians(sun_azimuth_deg)
    slope_rad = np.radians(slope_deg)
    aspect_rad = np.radians(aspect_deg)

    # Unit vector pointing toward Sun in local topocentric frame: [East, North, Up]
    # East = cos(el)*sin(az), North = cos(el)*cos(az), Up = sin(el)
    s_east = np.cos(el_rad) * np.sin(az_rad)
    s_north = np.cos(el_rad) * np.cos(az_rad)
    s_up = np.sin(el_rad)

    # Unit surface normal for tilted terrain:
    # A slope of slope_deg dipping in direction aspect_deg has normal tilted away:
    # n_east = sin(slope)*sin(aspect), n_north = sin(slope)*cos(aspect), n_up = cos(slope)
    n_east = np.sin(slope_rad) * np.sin(aspect_rad)
    n_north = np.sin(slope_rad) * np.cos(aspect_rad)
    n_up = np.cos(slope_rad)

    # Cosine of incidence angle = dot(s, n)
    cos_inc = float(s_east * n_east + s_north * n_north + s_up * n_up)
    cos_inc_clamped = max(-1.0, min(1.0, cos_inc))
    inc_angle_deg = float(np.degrees(np.arccos(cos_inc_clamped)))

    zenith_angle_deg = float(90.0 - sun_elevation_deg)

    return {
        "zenith_angle_deg": zenith_angle_deg,
        "incidence_angle_deg": inc_angle_deg,
        "cosine_incidence": max(0.0, cos_inc),
        "is_above_geometric_horizon": sun_elevation_deg > 0.0,
        "is_surface_illuminated": cos_inc > 0.0 and sun_elevation_deg > -0.27, # includes partial disc
    }
