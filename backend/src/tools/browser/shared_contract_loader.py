"""Helpers for importing the browser shared contract from the sidecar-visible tree."""

from __future__ import annotations

import sys
from pathlib import Path


def ensure_frontend_python_path() -> str:
    repo_root = Path(__file__).resolve().parents[4]
    frontend_python_dir = repo_root / "frontend" / "src" / "main" / "python"
    frontend_python_dir_str = str(frontend_python_dir)
    if frontend_python_dir_str not in sys.path:
        sys.path.insert(0, frontend_python_dir_str)
    return frontend_python_dir_str
