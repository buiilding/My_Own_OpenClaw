"""Platform user-data paths for sidecar-owned local storage."""

from __future__ import annotations

import os
import platform
from pathlib import Path

APP_DATA_DIR_NAME = "windieos"


def app_user_data_root() -> Path:
    if os.name == "nt":
        appdata = os.getenv("APPDATA")
        if not appdata:
            raise RuntimeError("APPDATA environment variable is not set on Windows")
        return Path(appdata) / APP_DATA_DIR_NAME

    if os.name == "posix":
        home_dir = Path.home()
        if platform.system() == "Darwin":
            return home_dir / "Library" / "Application Support" / APP_DATA_DIR_NAME
        return home_dir / ".config" / APP_DATA_DIR_NAME

    raise RuntimeError(f"Unsupported OS for sidecar user-data path: {os.name}")
