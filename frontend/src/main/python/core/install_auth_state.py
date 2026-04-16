"""Shared install-auth state helpers for sidecar backend clients."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

_AUTH_STATE_ENV_KEYS = (
    "WINDIE_BACKEND_AUTH_STATE_PATH",
    "BACKEND_AUTH_STATE_PATH",
)


def get_install_auth_state_path() -> Optional[Path]:
    for env_key in _AUTH_STATE_ENV_KEYS:
        raw_value = os.getenv(env_key)
        if not isinstance(raw_value, str):
            continue
        normalized = raw_value.strip()
        if normalized:
            return Path(normalized)
    return None


def load_install_auth_state() -> dict[str, Any] | None:
    path = get_install_auth_state_path()
    if path is None or not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def get_install_bearer_token() -> Optional[str]:
    payload = load_install_auth_state()
    token = payload.get("installToken") if isinstance(payload, dict) else None
    if isinstance(token, str) and token.strip():
        return token.strip()
    return None


def get_authenticated_user_id() -> Optional[str]:
    payload = load_install_auth_state()
    user_id = payload.get("userId") if isinstance(payload, dict) else None
    if isinstance(user_id, str) and user_id.strip():
        return user_id.strip()
    return None
