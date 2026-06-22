"""Transparency/content normalization helpers for rehydrate replay."""

from __future__ import annotations

from typing import Any, Dict, Optional

_ASSISTANT_FULL_CONTENT_MESSAGE_TYPES = frozenset(
    {
        "",
        "llm-text",
        "assistant",
        "assistant_response",
        "assistant-response",
        "assistant-message",
    }
)


def normalize_optional_string(value: Optional[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def normalize_transparency(transparency: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(transparency, dict):
        return None
    return dict(transparency)


def extract_system_prompt_from_transparency(
    transparency: Optional[Dict[str, Any]],
) -> Optional[str]:
    if not isinstance(transparency, dict):
        return None
    return normalize_optional_string(transparency.get("systemPrompt"))


def resolve_transparency_content(
    *,
    transparency: Dict[str, Any],
    message_key: str,
) -> Optional[str]:
    payload = transparency.get(message_key)
    if not isinstance(payload, dict):
        return None
    return normalize_optional_string(payload.get("content"))


def resolve_rehydrated_content(
    *,
    role: Any,
    normalized_message_type: str,
    raw_content: Any,
    transparency: Optional[Dict[str, Any]],
) -> Any:
    base_content = raw_content if raw_content is not None else ""
    if not isinstance(transparency, dict):
        return base_content

    normalized_role = str(role or "").strip().lower()
    if normalized_role == "user":
        full_user_content = resolve_transparency_content(
            transparency=transparency,
            message_key="fullUserMessage",
        )
        return full_user_content or base_content

    if (
        normalized_role == "assistant"
        and normalized_message_type in _ASSISTANT_FULL_CONTENT_MESSAGE_TYPES
    ):
        full_assistant_content = resolve_transparency_content(
            transparency=transparency,
            message_key="fullAssistantMessage",
        )
        return full_assistant_content or base_content

    return base_content
