"""
LUNAR EDGE — Data Manifest System
Tracks provenance of all downloaded scientific datasets.
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

MANIFEST_PATH = Path(__file__).parent.parent.parent / "data" / "manifest.json"


def _load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH, "r") as f:
            return json.load(f)
    return {"datasets": {}, "kernels": {}, "created": datetime.now(timezone.utc).isoformat()}


def _save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)


def register_dataset(
    key: str,
    name: str,
    source_url: str,
    local_path: Path,
    resolution_m: Optional[float] = None,
    crs: Optional[str] = None,
    units: Optional[str] = None,
    nodata_value: Optional[float] = None,
    product_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> None:
    """Record a downloaded dataset in the manifest."""
    manifest = _load_manifest()
    
    # Compute file hash for integrity checking
    file_hash = None
    if local_path.exists():
        h = hashlib.sha256()
        with open(local_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        file_hash = h.hexdigest()[:16]  # first 16 hex chars sufficient for reference
    
    manifest["datasets"][key] = {
        "name": name,
        "source_url": source_url,
        "local_path": str(local_path),
        "download_date": datetime.now(timezone.utc).isoformat(),
        "file_size_bytes": local_path.stat().st_size if local_path.exists() else None,
        "sha256_prefix": file_hash,
        "resolution_m_per_pixel": resolution_m,
        "coordinate_reference_system": crs,
        "elevation_units": units,
        "nodata_value": nodata_value,
        "product_id": product_id,
        "notes": notes,
    }
    _save_manifest(manifest)


def register_kernel(
    kernel_type: str,
    filename: str,
    source_url: str,
    local_path: Path,
    purpose: str,
) -> None:
    """Record a downloaded SPICE kernel in the manifest."""
    manifest = _load_manifest()
    
    file_hash = None
    if local_path.exists():
        h = hashlib.sha256()
        with open(local_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        file_hash = h.hexdigest()[:16]

    manifest["kernels"][filename] = {
        "kernel_type": kernel_type,
        "filename": filename,
        "source_url": source_url,
        "local_path": str(local_path),
        "download_date": datetime.now(timezone.utc).isoformat(),
        "file_size_bytes": local_path.stat().st_size if local_path.exists() else None,
        "sha256_prefix": file_hash,
        "purpose": purpose,
    }
    _save_manifest(manifest)


def get_manifest() -> dict:
    return _load_manifest()


def dataset_exists(key: str) -> bool:
    manifest = _load_manifest()
    if key not in manifest["datasets"]:
        return False
    local_path = Path(manifest["datasets"][key]["local_path"])
    return local_path.exists()


def kernel_exists(filename: str) -> bool:
    manifest = _load_manifest()
    if filename not in manifest["kernels"]:
        return False
    local_path = Path(manifest["kernels"][filename]["local_path"])
    return local_path.exists()
