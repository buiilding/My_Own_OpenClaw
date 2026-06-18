"""Helpers for bootstrapping local-runtime import paths in source/dev runs."""

from __future__ import annotations

import sys
from pathlib import Path


def ensure_local_runtime_python_path(entry_file: str | Path) -> str:
    """Ensure the local-runtime entrypoint directory is first on ``sys.path``."""

    local_runtime_python_dir = str(Path(entry_file).resolve().parent)
    try:
        existing_index = sys.path.index(local_runtime_python_dir)
    except ValueError:
        sys.path.insert(0, local_runtime_python_dir)
        return local_runtime_python_dir

    if existing_index != 0:
        sys.path.pop(existing_index)
        sys.path.insert(0, local_runtime_python_dir)
    return local_runtime_python_dir
