"""Thinking/reasoning extraction helpers for provider stream deltas."""

from __future__ import annotations

import re
from typing import Any, Optional

THINKING_TAG_PATTERN = re.compile(
    r"<(thinking|think)>(.*?)</\1>",
    re.IGNORECASE | re.DOTALL,
)


def extract_tagged_thinking_from_content(delta: Any) -> Optional[str]:
    """Extract `<thinking>...</thinking>` or `<think>...</think>` segments."""
    if isinstance(delta, dict):
        raw_content = delta.get("content")
    else:
        raw_content = getattr(delta, "content", None)

    if not isinstance(raw_content, str):
        return None

    match = THINKING_TAG_PATTERN.search(raw_content)
    if not match:
        return None
    return match.group(2)


def _extract_string_content(value: Any) -> Optional[str]:
    """Extract first non-empty string from common reasoning payload shapes."""
    if isinstance(value, str):
        return value if value else None
    if isinstance(value, list):
        for item in value:
            nested = _extract_string_content(item)
            if nested:
                return nested
        return None
    if isinstance(value, dict):
        for key in (
            "text",
            "content",
            "reasoning_content",
            "reasoningContent",
            "reasoning_details",
            "thinking",
            "thinking_content",
            "reasoning",
            "thought",
            "thoughts",
        ):
            nested = value.get(key)
            if isinstance(nested, str) and nested:
                return nested
    return None


def _extract_thinking_from_content_blocks(delta: Any) -> Optional[str]:
    """Extract thinking text from structured `content` block lists."""
    content_blocks = (
        delta.get("content")
        if isinstance(delta, dict)
        else getattr(delta, "content", None)
    )
    if not isinstance(content_blocks, list):
        return None

    for block in content_blocks:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type") or "").lower()
        if block_type not in {"thinking", "reasoning", "thought"}:
            continue
        extracted = _extract_string_content(block)
        if extracted:
            return extracted
    return None


def _extract_reasoning_field_from_object(delta: Any) -> Any:
    """Read supported reasoning fields from object-like deltas."""
    for field_name in (
        "reasoning_content",
        "reasoningContent",
        "reasoning_details",
        "thinking_content",
        "thinking",
        "reasoning",
        "thought",
        "thoughts",
    ):
        value = getattr(delta, field_name, None)
        if value is None:
            continue
        if isinstance(value, (str, dict, list)):
            return value
    return None


def extract_thinking_content(delta: Any) -> Optional[str]:
    """Extract reasoning/thinking content from a LiteLLM delta payload."""
    content = _extract_reasoning_field_from_object(delta)

    if not content and isinstance(delta, dict):
        content = (
            delta.get("reasoning_content")
            or delta.get("reasoningContent")
            or delta.get("reasoning_details")
            or delta.get("thinking_content")
            or delta.get("thinking")
            or delta.get("reasoning")
            or delta.get("thought")
            or delta.get("thoughts")
        )

    if not content:
        content = _extract_thinking_from_content_blocks(delta)

    if not content:
        content = extract_tagged_thinking_from_content(delta)

    extracted_string = _extract_string_content(content)
    if extracted_string:
        match = THINKING_TAG_PATTERN.search(extracted_string)
        if match:
            return match.group(2)
        return extracted_string

    return None
