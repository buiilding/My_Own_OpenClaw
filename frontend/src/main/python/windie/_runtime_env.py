"""Private Agent SDK environment key groups and fallback helpers."""

from __future__ import annotations

import os
from collections.abc import Iterable
from typing import Optional


LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS = (
    "AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT",
    "WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT",
)
LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS = (
    "AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE",
    "WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE",
)
LOCAL_RUNTIME_PYTHON_ENV_KEYS = (
    "AGENT_LOCAL_RUNTIME_PYTHON",
    "WINDIE_PYTHON",
)


def first_env_value(names: Iterable[str]) -> Optional[str]:
    """Return the first non-empty environment value from a fallback group."""
    for name in names:
        value = os.environ.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
