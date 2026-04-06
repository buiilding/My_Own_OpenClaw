"""Shared helpers for admitting replay-safe history rows."""

from __future__ import annotations

from typing import Any, Iterable, Optional


_TEXT_BLOCK_TYPES = frozenset({"text", "input_text", "output_text"})


def _extract_text_block(item: Any) -> Optional[str]:
    if not isinstance(item, dict):
        return None

    item_type = str(item.get("type") or "").strip()
    if item_type in _TEXT_BLOCK_TYPES:
        text = item.get("text")
        if isinstance(text, str) and text:
            return text
        content = item.get("content")
        if isinstance(content, str) and content:
            return content

    if item_type == "refusal":
        refusal = item.get("refusal") or item.get("text")
        if isinstance(refusal, str) and refusal:
            return refusal

    return None


def _iter_text_fragments(content: Any) -> Iterable[str]:
    if isinstance(content, str):
        if content:
            yield content
        return

    if isinstance(content, dict):
        text = _extract_text_block(content)
        if text:
            yield text
        return

    if not isinstance(content, list):
        if content is not None and not isinstance(content, (bytes, bytearray)):
            rendered = str(content)
            if rendered:
                yield rendered
        return

    for item in content:
        if isinstance(item, str):
            if item:
                yield item
            continue
        text = _extract_text_block(item)
        if text:
            yield text


def normalize_history_text_content(
    content: Any,
) -> str:
    """Normalize mixed content to the text that is safe to persist/replay."""
    return "".join(_iter_text_fragments(content))


def should_store_assistant_history_message(
    content: Any,
    *,
    tool_calls: Any = None,
) -> bool:
    """Return True when an assistant history row is replayable."""
    if isinstance(tool_calls, list) and any(isinstance(item, dict) for item in tool_calls):
        return True
    return bool(normalize_history_text_content(content).strip())

