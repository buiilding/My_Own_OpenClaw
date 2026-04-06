"""Shared helpers for admitting replay-safe history rows."""

from __future__ import annotations

from typing import Any, List, Optional

from backend.src.core.messages.content_blocks import (
    extract_text_from_content_part,
    iter_text_content_fragments,
    normalize_content_part_type,
)
from backend.src.core.types.schemas import MultimodalContent


def normalize_history_structured_content(
    content: Any,
    *,
    role: Any,
) -> Optional[MultimodalContent]:
    """Normalize replay-safe structured content for history storage."""
    normalized_role = str(role or "").strip().lower()
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
            if not item:
                continue
            if normalized_role == "assistant":
                normalized.append({"type": "output_text", "text": item})
            else:
                normalized.append({"type": "text", "text": item})
            continue

        if not isinstance(item, dict):
            continue

        item_type = normalize_content_part_type(item.get("type"))
        if item_type in {"text", "input_text", "output_text"}:
            text = extract_text_from_content_part(item, include_refusal=False)
            if not text:
                continue
            output_type = item_type
            if normalized_role == "assistant":
                output_type = "output_text"
            normalized.append({"type": output_type, "text": text})
            continue

        if item_type == "refusal":
            refusal = extract_text_from_content_part(item, include_refusal=True)
            if refusal:
                normalized.append({"type": "refusal", "refusal": refusal})
            continue

        if normalized_role != "assistant" and item_type in {"image_url", "input_image"}:
            image_url = item.get("image_url")
            if isinstance(image_url, dict):
                url = image_url.get("url")
            else:
                url = image_url or item.get("url")
            if isinstance(url, str) and url:
                normalized.append({"type": "image_url", "image_url": {"url": url}})

    return normalized or None


def normalize_assistant_history_structured_content(
    content: Any,
) -> Optional[MultimodalContent]:
    """Normalize assistant content blocks to replay-safe structured history."""
    return normalize_history_structured_content(content, role="assistant")


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
