import spiceypy as spice
import numpy as np
from pathlib import Path
import sys
sys.path.insert(0, '.')
from app.utils.coordinate_utils import compute_topocentric_basis, selenographic_to_cartesian_moon_me

# Load all 7 kernels
kdir = Path('data/kernels')
for k in ['naif0012.tls', 'de440s.bsp', 'pck00011.tpc', 'moon_pa_de440_200625.bpc', 'moon_de440_250416.tf', 'moon_assoc_me.tf', 'earth_latest_high_prec.bpc']:
    spice.furnsh(str(kdir / k))

et = spice.str2et('2026-01-15T12:00:00')

# Test sites
sites = [
    ("Haworth Rim", -87.45, -5.0, 0.0),
    ("Shackleton Region", -89.7, 129.0, 0.0)
]

for name, lat, lon, alt in sites:
    print(f"\n=== SITE: {name} (lat={lat}, lon={lon}) ===")
    obspos = selenographic_to_cartesian_moon_me(lat, lon, alt)
    
    # 1. SPICE azlcpo: [range, az, el, dr, daz, del]
    azl_sun, _ = spice.azlcpo('ELLIPSOID', 'SUN', et, 'CN+S', False, True, obspos, 'MOON', 'MOON_ME')
    azl_earth, _ = spice.azlcpo('ELLIPSOID', 'EARTH', et, 'CN+S', False, True, obspos, 'MOON', 'MOON_ME')
    
    up, north, east = compute_topocentric_basis(lat, lon)
    
    for body, azl_spice in [('SUN', azl_sun), ('EARTH', azl_earth)]:
        state, _ = spice.spkpos(body, et, 'MOON_ME', 'CN+S', 'MOON')
        v = state - obspos
        dist = np.linalg.norm(v)
        v_norm = v / dist
        u = np.dot(v_norm, up)
        n = np.dot(v_norm, north)
        e = np.dot(v_norm, east)
        el_calc = np.degrees(np.arcsin(u))
        az_calc = np.degrees(np.arctan2(e, n)) % 360.0
        
        range_sp = azl_spice[0]
        az_sp = np.degrees(azl_spice[1])
        el_sp = np.degrees(azl_spice[2])
        
        az_diff = abs(az_sp - az_calc)
        if az_diff > 180: az_diff = 360 - az_diff
        el_diff = abs(el_sp - el_calc)
        r_diff = abs(range_sp - dist)
        
        print(f"  {body:5s} SPICE: az={az_sp:10.5f}°, el={el_sp:8.5f}°, r={range_sp:,.1f} km")
        print(f"        CALC : az={az_calc:10.5f}°, el={el_calc:8.5f}°, r={dist:,.1f} km")
        print(f"        DELTA: az_err={az_diff:10.7f}°, el_err={el_diff:8.7f}°, r_err={r_diff:6.4f} km")
