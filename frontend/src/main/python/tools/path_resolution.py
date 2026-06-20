"""
Shared workspace-aware path resolution helpers for Python local-runtime tools.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

_WORKSPACE_ACCESS_PERMISSION_ID = "filesystem_workspace_access"
ENV_AGENT_PERMISSION_STATE_PATH = "AGENT_PERMISSION_STATE_PATH"
ENV_WINDIE_PERMISSION_STATE_PATH = "WINDIE_PERMISSION_STATE_PATH"


def resolve_permission_state_path() -> Optional[Path]:
    for env_name in (ENV_AGENT_PERMISSION_STATE_PATH, ENV_WINDIE_PERMISSION_STATE_PATH):
        raw_path = os.environ.get(env_name, "").strip()
        if raw_path:
            return Path(raw_path).expanduser()
    return None


def resolve_default_workspace_directory() -> Path:
    permission_state_path = resolve_permission_state_path()
    if permission_state_path:
        try:
            with open(permission_state_path, "r", encoding="utf-8") as handle:
                raw_state = json.load(handle)
        except (FileNotFoundError, OSError, ValueError, TypeError):
            raw_state = None
        if isinstance(raw_state, dict):
            permissions = raw_state.get("permissions")
            if isinstance(permissions, dict):
                workspace_entry = permissions.get(_WORKSPACE_ACCESS_PERMISSION_ID)
                if (
                    isinstance(workspace_entry, dict)
                    and workspace_entry.get("granted") is True
                ):
                    selected_paths = workspace_entry.get("selected_paths")
                    if isinstance(selected_paths, list):
                        for selected_path in selected_paths:
                            if (
                                not isinstance(selected_path, str)
                                or not selected_path.strip()
                            ):
                                continue
                            workspace_path = Path(selected_path).expanduser()
                            if workspace_path.exists() and workspace_path.is_dir():
                                return workspace_path

    return Path.home()


def resolve_workspace_path(
    raw_path: object,
) -> tuple[Optional[Path], Optional[str], Optional[str]]:
    """
    Resolve a user-supplied file or directory path from the active workspace.

    Returns a tuple of:
    - resolved path (or None on validation failure)
    - normalized original input string (or None if unavailable)
    - validation error message (or None on success)
    """
    default_directory = resolve_default_workspace_directory()

    if raw_path is None:
        return default_directory, None, None

    if not isinstance(raw_path, str):
        return None, None, "Path must be a string"

    normalized_path = raw_path.strip()
    if not normalized_path:
        return default_directory, normalized_path, None

    candidate_path = Path(normalized_path).expanduser()
    if not candidate_path.is_absolute():
        candidate_path = default_directory / candidate_path

    try:
        resolved_path = candidate_path.resolve(strict=False)
    except OSError:
        resolved_path = candidate_path

    return resolved_path, normalized_path, None
