"""
LUNAR EDGE — Automated SPICE Kernel Downloader
Downloads and verifies the verified DE440-consistent SPICE kernel set from NAIF.
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

import urllib.request
import hashlib
import json
from app.utils.data_manifest import register_kernel, get_manifest

KERNELS_DIR = backend_dir / "data" / "kernels"
KERNELS_DIR.mkdir(parents=True, exist_ok=True)

# Verified kernels on https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
VERIFIED_KERNELS = [
    {
        "filename": "naif0012.tls",
        "type": "LSK",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        "purpose": "Leap seconds kernel — UTC to Ephemeris Time (ET/TDB) conversion",
    },
    {
        "filename": "de440s.bsp",
        "type": "SPK",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
        "purpose": "JPL DE440s planetary ephemeris (1849-2150). Positions of Moon, Earth, Sun in ICRF",
    },
    {
        "filename": "moon_pa_de440_200625.bpc",
        "type": "PCK (binary)",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc",
        "purpose": "Binary lunar PCK matching DE440. Dynamic lunar orientation and libration model (MOON_PA)",
    },
    {
        "filename": "moon_de440_250416.tf",
        "type": "FK",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf",
        "purpose": "DE440 lunar frame kernel defining MOON_PA_DE440 and MOON_ME_DE440 frames",
    },
    {
        "filename": "moon_assoc_me.tf",
        "type": "FK",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_assoc_me.tf",
        "purpose": "Associates generic 'MOON_ME' frame name to the DE440 Mean Earth frame",
    },
    {
        "filename": "pck00011.tpc",
        "type": "PCK (text)",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc",
        "purpose": "Planetary constants kernel — triaxial radii and standard gravitational parameters",
    },
    {
        "filename": "earth_latest_high_prec.bpc",
        "type": "PCK (binary)",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/earth_latest_high_prec.bpc",
        "purpose": "High-precision Earth orientation binary PCK (EOP)",
    },
]

def download_kernels():
    print("=" * 70)
    print("LUNAR EDGE — SPICE KERNEL ACQUISITION")
    print("=" * 70)
    
    for k in VERIFIED_KERNELS:
        dest = KERNELS_DIR / k["filename"]
        if dest.exists() and dest.stat().st_size > 0:
            print(f"[EXISTS] {k['filename']} ({dest.stat().st_size / 1024:.1f} KB)")
            register_kernel(k["type"], k["filename"], k["url"], dest, k["purpose"])
            continue

        print(f"[DOWNLOADING] {k['filename']} from {k['url']} ...")
        tmp_dest = dest.with_suffix(".tmp")
        try:
            req = urllib.request.Request(k["url"], headers={"User-Agent": "LUNAR-EDGE/1.0 (NASA Space Apps)"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                total = int(resp.headers.get("content-length", 0))
                downloaded = 0
                with open(tmp_dest, "wb") as f:
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0 and downloaded % (1024 * 1024) < 65536:
                            pct = (downloaded / total) * 100
                            print(f"  {downloaded / (1024*1024):.1f} / {total / (1024*1024):.1f} MB ({pct:.0f}%)", end="\r")
            
            if tmp_dest.exists():
                tmp_dest.rename(dest)
                print(f"\n  Successfully acquired: {dest.name} ({dest.stat().st_size / 1024:.1f} KB)")
                register_kernel(k["type"], k["filename"], k["url"], dest, k["purpose"])
        except Exception as e:
            print(f"\n  ERROR downloading {k['filename']}: {e}")
            if tmp_dest.exists():
                tmp_dest.unlink()

    print("\nVerifying kernel manifest...")
    manifest = get_manifest()
    print(f"Registered kernels in manifest: {len(manifest.get('kernels', {}))}")
    for name, data in manifest.get("kernels", {}).items():
        print(f"  - [{data['kernel_type']}] {name}: {data['sha256_prefix']}... ({data['file_size_bytes']:,} bytes)")

if __name__ == "__main__":
    download_kernels()
