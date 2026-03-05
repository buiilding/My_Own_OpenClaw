"""Environment flag parsing helpers shared across sidecar processes."""

from __future__ import annotations

import os


def env_flag_enabled(name: str, default: bool = True) -> bool:
    """Parse permissive boolean env flags (1/0, true/false, on/off, yes/no)."""
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"0", "false", "off", "no"}:
        return False
    if normalized in {"1", "true", "on", "yes"}:
        return True
    return default
