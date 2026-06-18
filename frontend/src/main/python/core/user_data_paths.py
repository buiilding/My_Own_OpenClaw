"""Platform user-data paths for Python local-runtime storage."""

from __future__ import annotations

import os
import platform
from pathlib import Path
from typing import Mapping

APP_DATA_DIR_NAME = "desktop-runtime"


def _env_value(env: Mapping[str, str], key: str) -> str:
    return str(env.get(key) or "").strip()


def _current_platform_name() -> str:
    if os.name == "nt":
        return "win32"
    if os.name == "posix" and platform.system() == "Darwin":
        return "darwin"
    if os.name == "posix":
        return "linux"
    return os.name


def app_user_data_root(
    *,
    env: Mapping[str, str] | None = None,
    platform_name: str | None = None,
    override_env_key: str | None = None,
    allow_windows_home_fallback: bool = False,
    honor_xdg_config_home: bool = False,
) -> Path:
    runtime_env = os.environ if env is None else env
    if override_env_key:
        override = _env_value(runtime_env, override_env_key)
        if override:
            return Path(override)

    normalized_platform = (platform_name or _current_platform_name()).strip().lower()
    if normalized_platform in {"win32", "nt", "windows"}:
        appdata = _env_value(runtime_env, "APPDATA")
        if not appdata:
            if allow_windows_home_fallback:
                appdata = str(Path.home() / "AppData" / "Roaming")
            else:
                raise RuntimeError("APPDATA environment variable is not set on Windows")
        return Path(appdata) / APP_DATA_DIR_NAME

    if normalized_platform in {"darwin", "macos"}:
        home_dir = Path.home()
        return home_dir / "Library" / "Application Support" / APP_DATA_DIR_NAME

    if normalized_platform in {"linux", "posix"}:
        config_home = (
            _env_value(runtime_env, "XDG_CONFIG_HOME") if honor_xdg_config_home else ""
        )
        return Path(config_home or (Path.home() / ".config")) / APP_DATA_DIR_NAME

    raise RuntimeError(f"Unsupported OS for local-runtime user-data path: {os.name}")
