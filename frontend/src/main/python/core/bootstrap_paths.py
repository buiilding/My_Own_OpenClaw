"""Helpers for bootstrapping sidecar import paths in source/dev runs."""

from __future__ import annotations

import sys
from pathlib import Path


def ensure_sidecar_python_path(entry_file: str | Path) -> str:
    """Ensure the sidecar entrypoint directory is first on ``sys.path``."""

    frontend_python_dir = str(Path(entry_file).resolve().parent)
    try:
        existing_index = sys.path.index(frontend_python_dir)
    except ValueError:
        sys.path.insert(0, frontend_python_dir)
        return frontend_python_dir

    if existing_index != 0:
        sys.path.pop(existing_index)
        sys.path.insert(0, frontend_python_dir)
    return frontend_python_dir
