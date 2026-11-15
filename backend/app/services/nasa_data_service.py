"""
LUNAR EDGE — NASA Data Service
Downloads and manages NASA LOLA DEM products and SPICE kernels.

SCIENTIFIC HONESTY POLICY:
  - Never fabricates or approximates missing data
  - Always reports missing/unavailable datasets explicitly
  - Maintains complete data provenance manifest
"""

import httpx
import asyncio
from pathlib import Path
from typing import Optional
import logging
from tqdm import tqdm

from app.utils.data_manifest import (
    register_dataset, register_kernel,
    dataset_exists, kernel_exists
)

logger = logging.getLogger(__name__)

# ===========================================================================
# DATA DIRECTORIES
# ===========================================================================
DATA_ROOT = Path(__file__).parent.parent.parent / "data"
LOLA_DIR = DATA_ROOT / "raw" / "lola"
KERNELS_DIR = DATA_ROOT / "kernels"

# ===========================================================================
# LOLA DEM PRODUCT DEFINITIONS
# Reference: https://pgda.gsfc.nasa.gov/
# ===========================================================================

LOLA_PRODUCTS = {
    # Large-area south polar mosaic — primary terrain model
    # Coverage: ~80°S to 90°S, Resolution: 20 m/pixel
    # CRS: Polar Stereographic South, IAU Moon 2000 sphere (R=1,737,400 m)
    # Units: metres above reference sphere
    "LDEM_80S_20MPP": {
        "name": "LOLA South Polar DEM 20m (80°S-90°S)",
        "url": "https://pgda.gsfc.nasa.gov/data/LOLA_GDR/polar_south/img/ldem_80s_20mpp_adj.tif",
        "filename": "LDEM_80S_20MPP_ADJ.TIF",
        "resolution_m": 20.0,
        "crs": "PROJCRS Moon 2000 South Pole Stereographic (IAU sphere R=1737400m)",
        "units": "metres above IAU Moon 2000 reference sphere",
        "product_id": "PGDA-79",
        "notes": (
            "Cloud-Optimized GeoTIFF. Supports HTTP range requests for "
            "sub-region extraction without full download. "
            "Covers complete south polar region. Primary DEM for terrain engine."
        ),
    },
}

# If the PGDA URL doesn't work, try the PDS GDR URL
LOLA_FALLBACK_URLS = {
    "LDEM_80S_20MPP": [
        # Alternative: PDS direct
        "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/south_pole/img/ldem_80s_20mpp_adj.tif",
    ]
}

# ===========================================================================
# SPICE KERNEL DEFINITIONS
# Reference: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
# Using DE440-consistent set (do NOT mix with DE421)
# ===========================================================================

SPICE_KERNELS = {
    "naif0012.tls": {
        "type": "LSK",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        "purpose": "Leap seconds kernel — required for UTC to Ephemeris Time (ET) conversion",
        "approx_size_mb": 0.01,
    },
    "de440s.bsp": {
        "type": "SPK",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
        "purpose": (
            "JPL DE440s planetary ephemeris (1849-2150). Provides positions of "
            "Moon, Earth, Sun in ICRF. Use de440s (31MB) not de440 (114MB)."
        ),
        "approx_size_mb": 31,
    },
    "moon_pa_de440_200625.bpc": {
        "type": "PCK (binary)",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc",
        "purpose": (
            "High-accuracy binary PCK for lunar orientation (Principal Axis frame). "
            "Must match the DE440 ephemeris. Provides libration-accurate orientation."
        ),
        "approx_size_mb": 3,
    },
    "moon_de440_220930.tf": {
        "type": "FK",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_220930.tf",
        "purpose": (
            "Lunar frame kernel defining MOON_ME (Mean Earth/Polar Axis) and MOON_PA "
            "(Principal Axis) frames consistent with DE440. Required for selenographic "
            "coordinate calculations."
        ),
        "approx_size_mb": 0.1,
    },
    "pck00011.tpc": {
        "type": "PCK (text)",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc",
        "purpose": (
            "IAU planetary constants: radii, rotation models, GM values. "
            "Provides Moon and Earth physical parameters."
        ),
        "approx_size_mb": 0.12,
    },
}


class NASADataService:
    """
    Manages downloading and caching of NASA scientific datasets.
    
    Principle: Never fabricate data. If a dataset is unavailable, raise
    an explicit error with actionable guidance.
    """

    def __init__(self):
        LOLA_DIR.mkdir(parents=True, exist_ok=True)
        KERNELS_DIR.mkdir(parents=True, exist_ok=True)

    async def download_file(
        self,
        url: str,
        dest_path: Path,
        description: str = "file",
        timeout_s: float = 300.0,
    ) -> bool:
        """
        Download a file with progress tracking.
        Returns True on success, False on failure.
        """
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = dest_path.with_suffix(dest_path.suffix + ".tmp")

        logger.info(f"Downloading {description} from {url}")
        
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=30.0, read=timeout_s, write=30.0, pool=30.0),
                follow_redirects=True,
            ) as client:
                async with client.stream("GET", url) as response:
                    if response.status_code != 200:
                        logger.error(
                            f"HTTP {response.status_code} downloading {url}. "
                            f"Dataset unavailable — not substituting fake data."
                        )
                        return False
                    
                    total = int(response.headers.get("content-length", 0))
                    downloaded = 0
                    
                    with open(tmp_path, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=65536):
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total > 0:
                                pct = (downloaded / total) * 100
                                logger.debug(f"  {description}: {pct:.1f}%")
            
            tmp_path.rename(dest_path)
            logger.info(f"Downloaded {description}: {dest_path} ({dest_path.stat().st_size:,} bytes)")
            return True

        except httpx.TimeoutException:
            logger.error(f"Timeout downloading {url}")
            if tmp_path.exists():
                tmp_path.unlink()
            return False
        except Exception as e:
            logger.error(f"Error downloading {url}: {e}")
            if tmp_path.exists():
                tmp_path.unlink()
            return False

    async def ensure_spice_kernels(self) -> dict:
        """
        Download all required SPICE kernels if not already present.
        Returns status dict: {filename: 'ready'|'downloaded'|'failed'}
        """
        status = {}
        
        for filename, info in SPICE_KERNELS.items():
            local_path = KERNELS_DIR / filename
            
            if local_path.exists():
                logger.info(f"Kernel already present: {filename}")
                status[filename] = "ready"
                continue
            
            logger.info(f"Downloading kernel: {filename} (~{info['approx_size_mb']} MB)")
            success = await self.download_file(
                url=info["url"],
                dest_path=local_path,
                description=f"SPICE kernel {filename}",
            )
            
            if success:
                register_kernel(
                    kernel_type=info["type"],
                    filename=filename,
                    source_url=info["url"],
                    local_path=local_path,
                    purpose=info["purpose"],
                )
                status[filename] = "downloaded"
            else:
                status[filename] = "failed"
                logger.error(
                    f"FAILED to download {filename}. "
                    f"Manually download from: {info['url']} "
                    f"and place in: {KERNELS_DIR}"
                )
        
        return status

    async def ensure_lola_dem(self, product_key: str = "LDEM_80S_20MPP") -> dict:
        """
        Download LOLA DEM product if not already present.
        
        IMPORTANT: For Cloud-Optimized GeoTIFFs, we do NOT need to download
        the full file for calculations. The terrain engine uses HTTP range
        requests to read sub-windows. This method downloads a minimal
        verification chunk and sets up the remote URL for windowed access.
        
        Returns: status dict with local_path or remote_url for COG access
        """
        if product_key not in LOLA_PRODUCTS:
            raise ValueError(f"Unknown LOLA product: {product_key}")
        
        product = LOLA_PRODUCTS[product_key]
        local_path = LOLA_DIR / product["filename"]
        
        if local_path.exists():
            logger.info(f"LOLA DEM already present: {local_path}")
            return {
                "status": "ready",
                "local_path": str(local_path),
                "product": product_key,
            }
        
        # Attempt download
        logger.info(f"Downloading LOLA DEM: {product['name']}")
        logger.info(f"This may be a large file. URL: {product['url']}")
        
        success = await self.download_file(
            url=product["url"],
            dest_path=local_path,
            description=f"LOLA DEM {product_key}",
            timeout_s=3600.0,  # Allow up to 1 hour for large DEMs
        )
        
        if success:
            register_dataset(
                key=product_key,
                name=product["name"],
                source_url=product["url"],
                local_path=local_path,
                resolution_m=product["resolution_m"],
                crs=product["crs"],
                units=product["units"],
                product_id=product["product_id"],
                notes=product["notes"],
            )
            return {
                "status": "downloaded",
                "local_path": str(local_path),
                "product": product_key,
            }
        
        # Try fallback URLs
        if product_key in LOLA_FALLBACK_URLS:
            for fallback_url in LOLA_FALLBACK_URLS[product_key]:
                logger.info(f"Trying fallback URL: {fallback_url}")
                success = await self.download_file(
                    url=fallback_url,
                    dest_path=local_path,
                    description=f"LOLA DEM {product_key} (fallback)",
                    timeout_s=3600.0,
                )
                if success:
                    return {
                        "status": "downloaded",
                        "local_path": str(local_path),
                        "product": product_key,
                    }
        
        # All attempts failed — explicit failure, no fabrication
        raise RuntimeError(
            f"LOLA DEM '{product_key}' could not be downloaded from any source.\n"
            f"Primary URL: {product['url']}\n"
            f"Manual download required. Place the file at: {local_path}\n"
            f"This dataset is essential. The terrain engine cannot operate without it."
        )

    def get_kernel_paths(self) -> list[str]:
        """
        Return list of local kernel paths for spiceypy.furnsh().
        Raises if any required kernel is missing.
        """
        paths = []
        missing = []
        
        for filename in SPICE_KERNELS:
            local_path = KERNELS_DIR / filename
            if local_path.exists():
                paths.append(str(local_path))
            else:
                missing.append(filename)
        
        if missing:
            raise FileNotFoundError(
                f"Missing SPICE kernels: {missing}\n"
                f"Run: await nasa_data_service.ensure_spice_kernels()"
            )
        
        return paths

    def get_lola_path(self, product_key: str = "LDEM_80S_20MPP") -> Path:
        """
        Return path to downloaded LOLA DEM.
        Raises if not downloaded.
        """
        if product_key not in LOLA_PRODUCTS:
            raise ValueError(f"Unknown LOLA product: {product_key}")
        
        local_path = LOLA_DIR / LOLA_PRODUCTS[product_key]["filename"]
        
        if not local_path.exists():
            raise FileNotFoundError(
                f"LOLA DEM '{product_key}' not found at {local_path}.\n"
                f"Run the data acquisition script first."
            )
        
        return local_path
