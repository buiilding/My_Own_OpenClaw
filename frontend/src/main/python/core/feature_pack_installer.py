"""
Runtime feature-pack installer for optional sidecar capabilities.

Feature packs are installed into a user-writable site-packages directory so
packaged app resources remain immutable.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys
from typing import Dict, Tuple

from core.user_data_paths import windie_user_data_root

_FEATURE_PACK_REQUIREMENTS: Dict[str, str] = {
    "browser": "requirements.runtime.txt",
}

_FEATURE_PACK_MODULE_MARKERS: Dict[str, Tuple[str, ...]] = {
    "browser": ("browser_use", "playwright", "markdownify"),
}


def _resolve_user_data_root() -> Path:
    return windie_user_data_root()


def get_feature_pack_site_packages_dir() -> Path:
    return _resolve_user_data_root() / "sidecar_feature_packs" / "site-packages"


def _resolve_sidecar_python_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _resolve_requirements_file(feature_pack: str) -> Path:
    requirements_name = _FEATURE_PACK_REQUIREMENTS.get(feature_pack)
    if not requirements_name:
        raise RuntimeError(f"Unknown feature pack: {feature_pack}")
    return _resolve_sidecar_python_root() / requirements_name


def _is_module_available(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def ensure_feature_pack_site_packages_on_path() -> Path:
    site_packages = get_feature_pack_site_packages_dir()
    site_packages_str = str(site_packages)
    if site_packages_str not in sys.path:
        sys.path.insert(0, site_packages_str)
    return site_packages


def is_feature_pack_available(feature_pack: str) -> bool:
    marker_modules = _FEATURE_PACK_MODULE_MARKERS.get(feature_pack)
    if not marker_modules:
        return False
    ensure_feature_pack_site_packages_on_path()
    return all(_is_module_available(module_name) for module_name in marker_modules)


def install_feature_pack(feature_pack: str) -> tuple[bool, str | None]:
    ensure_feature_pack_site_packages_on_path()
    requirements_path = _resolve_requirements_file(feature_pack)
    if not requirements_path.exists():
        return False, f"Missing requirements file: {requirements_path}"

    site_packages = get_feature_pack_site_packages_dir()
    site_packages.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "--disable-pip-version-check",
        "--target",
        str(site_packages),
        "-r",
        str(requirements_path),
    ]

    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except Exception as exc:
        return False, f"Failed to invoke pip for feature pack '{feature_pack}': {exc}"

    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        stdout = (completed.stdout or "").strip()
        message_parts = [
            f"pip install failed for feature pack '{feature_pack}'",
            f"exit_code={completed.returncode}",
        ]
        if stderr:
            message_parts.append(f"stderr={stderr[-1200:]}")
        elif stdout:
            message_parts.append(f"stdout={stdout[-1200:]}")
        return False, " | ".join(message_parts)

    importlib.invalidate_caches()
    if not is_feature_pack_available(feature_pack):
        return (
            False,
            (
                f"Feature pack '{feature_pack}' installed but required modules "
                "are still unavailable in runtime import path."
            ),
        )

    return True, None


def build_feature_pack_manual_install_message(feature_pack: str) -> str:
    requirements_path = _resolve_requirements_file(feature_pack)
    site_packages = get_feature_pack_site_packages_dir()
    return (
        "Feature pack installation failed. "
        "Retry with network access or install manually: "
        f'`{sys.executable} -m pip install --target "{site_packages}" -r "{requirements_path}"`'
    )
