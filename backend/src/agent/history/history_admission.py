"""Shared helpers for admitting replay-safe history rows."""

from __future__ import annotations

from typing import Any, List, Optional

from backend.src.core.messages.content_blocks import (
    extract_text_from_content_part,
    iter_text_content_fragments,
    normalize_content_part_type,
)
from backend.src.core.types.schemas import MultimodalContent


def normalize_assistant_history_structured_content(
    content: Any,
) -> Optional[MultimodalContent]:
    """Normalize assistant content blocks to replay-safe structured history."""
    if isinstance(content, str):
        return None

    items: List[Any]
    if isinstance(content, dict):
        items = [content]
    elif isinstance(content, list):
        items = list(content)
    else:
        return None

    normalized: MultimodalContent = []
    for item in items:
        if isinstance(item, str):
            if item:
                normalized.append({"type": "output_text", "text": item})
            continue

        if not isinstance(item, dict):
            continue

        item_type = normalize_content_part_type(item.get("type"))
        if item_type in {"text", "output_text"}:
            text = extract_text_from_content_part(item, include_refusal=False)
            if text:
                normalized.append({"type": "output_text", "text": text})
            continue

        if item_type == "refusal":
            refusal = extract_text_from_content_part(item, include_refusal=True)
            if refusal:
                normalized.append({"type": "refusal", "refusal": refusal})

    return normalized or None


def normalize_history_text_content(
    content: Any,
) -> str:
    """Normalize mixed content to the text that is safe to persist/replay."""
    return "".join(
        iter_text_content_fragments(
            content,
            include_refusal=True,
            stringify_scalars=True,
        )
    )


def should_store_assistant_history_message(
    content: Any,
    *,
    tool_calls: Any = None,
) -> bool:
    """Return True when an assistant history row is replayable."""
    if isinstance(tool_calls, list) and any(
        isinstance(item, dict) for item in tool_calls
    ):
        return True
    return bool(normalize_history_text_content(content).strip())
