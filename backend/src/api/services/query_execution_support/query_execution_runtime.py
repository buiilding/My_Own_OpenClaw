"""Runtime helper utilities for query execution service."""

from __future__ import annotations

import logging
from typing import Any, List, Optional, Type

from backend.src.api.schema import QueryMessage
from backend.src.services.artifacts import ArtifactStore

logger = logging.getLogger(__name__)
_RUNTIME_STATE_KEYS = ("active_window", "mouse_position", "screen_resolution")


def resolve_screenshots(
    message: QueryMessage,
    *,
    artifact_store_cls: Type[ArtifactStore],
    session_manager_config: Any,
    user_id: Optional[str] = None,
) -> Optional[List[str]]:
    """Resolve screenshots from inline payload and/or artifact references."""
    screenshot = message.payload.screenshot
    normalized_inline_screenshot = (
        screenshot.strip() if isinstance(screenshot, str) else None
    )
    screenshot_ref = message.payload.screenshot_ref
    normalized_single_ref = (
        screenshot_ref.strip() if isinstance(screenshot_ref, str) else None
    )
    screenshot_refs = (
        message.payload.screenshot_refs
        if isinstance(message.payload.screenshot_refs, list)
        else None
    )

    if normalized_inline_screenshot:
        return [normalized_inline_screenshot]

    normalized_ref_list = [
        ref.strip()
        for ref in (screenshot_refs or [])
        if isinstance(ref, str) and ref.strip()
    ]
    ref_candidates = (
        normalized_ref_list
        if normalized_ref_list
        else ([normalized_single_ref] if normalized_single_ref else [])
    )
    if not ref_candidates:
        return None

    resolved_screenshots: List[str] = []
    try:
        store = artifact_store_cls.from_config(session_manager_config)
    except Exception as exc:
        logger.warning(
            "Failed to initialize artifact store for screenshots %s: %s",
            ref_candidates,
            exc,
        )
        return None

    for ref in ref_candidates:
        try:
            resolved_screenshots.append(store.load_base64(ref, owner_user_id=user_id))
        except Exception as exc:
            logger.warning("Failed to load screenshot artifact %s: %s", ref, exc)

    return resolved_screenshots or None


def resolve_query_screenshot_metadata(
    message: QueryMessage,
) -> Optional[dict[str, Any]]:
    capture_meta = message.payload.capture_meta
    return dict(capture_meta) if isinstance(capture_meta, dict) else None


def resolve_query_runtime_system_state(message: QueryMessage) -> Optional[dict[str, str]]:
    """Extract backend-only runtime state (not model-facing prompt content)."""
    payload_state = getattr(message.payload, "system_state_internal", None)
    if not isinstance(payload_state, dict):
        return None

    runtime_state: dict[str, str] = {}
    for key in _RUNTIME_STATE_KEYS:
        value = payload_state.get(key)
        if isinstance(value, str) and value.strip():
            runtime_state[key] = value.strip()

    return runtime_state or None


def apply_query_runtime_system_state(agent_instance: Any, message: QueryMessage) -> None:
    """Best-effort seed of session runtime state before tool preparation."""
    runtime_state = resolve_query_runtime_system_state(message)
    if not runtime_state:
        return

    setter = getattr(agent_instance, "set_current_system_state", None)
    if not callable(setter):
        return

    getter = getattr(agent_instance, "get_current_system_state", None)
    existing_state = getter() if callable(getter) else None
    merged_state: dict[str, str] = {}
    if isinstance(existing_state, dict):
        for key in _RUNTIME_STATE_KEYS:
            value = existing_state.get(key)
            if isinstance(value, str) and value.strip():
                merged_state[key] = value.strip()
    merged_state.update(runtime_state)

    try:
        setter(merged_state)
    except Exception as exc:
        logger.warning("Failed to apply query runtime system state: %s", exc)


def build_stream_context(
    *,
    agent_instance: Any,
    msg_id: str,
    conversation_ref: Optional[str],
) -> dict[str, Optional[str]]:
    """Build immutable-per-query stream context once and reuse it across events."""
    return {
        "user_id": agent_instance.user_id,
        "session_id": agent_instance.session_id,
        "conversation_ref": conversation_ref,
        "turn_ref": msg_id,
    }
