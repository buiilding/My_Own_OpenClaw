"""Helpers for bootstrapping sidecar import paths in source/dev runs."""

from __future__ import annotations

import sys
from pathlib import Path


def _promote_sys_path(path_value: str) -> None:
    """Move a path to the front of sys.path without leaving duplicates behind."""
    try:
        existing_index = sys.path.index(path_value)
    except ValueError:
        sys.path.insert(0, path_value)
        return

    if existing_index == 0:
        return

    sys.path.pop(existing_index)
    sys.path.insert(0, path_value)


def ensure_sidecar_import_paths(entry_file: str | Path) -> tuple[str, str]:
    """
    Ensure sidecar entrypoints can import both local modules and repo-root packages.

    Source/dev Electron runs launch the sidecar with cwd set to
    ``frontend/src/main/python``. That path is sufficient for local sidecar modules
    but not for imports like ``backend.src.tools.tool_catalog`` that resolve from
    the repository root. Promote both paths to the front of ``sys.path`` so the
    sidecar can run from either direct Python invocation or Electron launch.
    """

    entry_path = Path(entry_file).resolve()
    frontend_python_dir = entry_path.parent
    repo_root = entry_path.parents[4]

    repo_root_str = str(repo_root)
    frontend_python_dir_str = str(frontend_python_dir)

    _promote_sys_path(repo_root_str)
    _promote_sys_path(frontend_python_dir_str)
    return frontend_python_dir_str, repo_root_str
