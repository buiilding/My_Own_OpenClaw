"""Shared helpers for admitting replay-safe history rows."""

from __future__ import annotations

from typing import Any

from backend.src.core.messages.content_blocks import iter_text_content_fragments


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
