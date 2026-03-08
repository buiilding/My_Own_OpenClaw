"""Provider-native reasoning extraction helpers."""

from __future__ import annotations

from typing import Any, Iterable, List, Optional


def _get_value(source: Any, key: str) -> Any:
    if source is None:
        return None
    if isinstance(source, dict):
        return source.get(key)
    return getattr(source, key, None)


def _iter_text_values(value: Any) -> Iterable[str]:
    if value is None:
        return

    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            yield stripped
        return

    if isinstance(value, list):
        for item in value:
            yield from _iter_text_values(item)
        return

    if isinstance(value, dict):
        for key in (
            "text",
            "thinking",
            "reasoning_content",
            "reasoningContent",
            "content",
        ):
            yield from _iter_text_values(value.get(key))
        return

    if isinstance(value, (int, float, bool)):
        return

    for key in (
        "text",
        "thinking",
        "reasoning_content",
        "reasoningContent",
        "content",
    ):
        yield from _iter_text_values(getattr(value, key, None))


def _join_text_values(values: Iterable[str]) -> Optional[str]:
    parts = [part for part in values if isinstance(part, str) and part.strip()]
    if not parts:
        return None
    return "\n".join(parts)


def extract_anthropic_thinking_content(delta: Any) -> Optional[str]:
    """Extract Anthropic-native thinking content from streaming deltas."""
    direct_thinking = _get_value(delta, "thinking")
    joined = _join_text_values(_iter_text_values(direct_thinking))
    if joined:
        return joined

    content = _get_value(delta, "content")
    if isinstance(content, list):
        thinking_parts: List[str] = []
        for block in content:
            if str(_get_value(block, "type") or "").lower() not in {
                "thinking",
                "thinking_delta",
                "redacted_thinking",
            }:
                continue
            text = _join_text_values(_iter_text_values(block))
            if text:
                thinking_parts.append(text)
        if thinking_parts:
            return "\n".join(thinking_parts)
    return None


def extract_gemini_thinking_content(delta: Any) -> Optional[str]:
    """Extract Gemini-native thinking content from streaming deltas."""
    thinking_blocks = _get_value(delta, "thinking_blocks")
    joined = _join_text_values(_iter_text_values(thinking_blocks))
    if joined:
        return joined

    reasoning_content = _get_value(delta, "reasoning_content")
    joined = _join_text_values(_iter_text_values(reasoning_content))
    if joined:
        return joined

    content = _get_value(delta, "content")
    if isinstance(content, list):
        thought_parts: List[str] = []
        for block in content:
            if _get_value(block, "thought") is not True:
                continue
            text = _join_text_values(_iter_text_values(block))
            if text:
                thought_parts.append(text)
        if thought_parts:
            return "\n".join(thought_parts)
    return None


def extract_gemini_text_content(delta: Any) -> Optional[str]:
    """Extract Gemini-visible text while ignoring thought-tagged parts."""
    content = _get_value(delta, "content")
    if isinstance(content, str):
        stripped = content.strip()
        return content if stripped else None

    if not isinstance(content, list):
        return None

    text_parts: List[str] = []
    for block in content:
        if str(_get_value(block, "type") or "").lower() not in {"", "text"}:
            continue
        if _get_value(block, "thought") is True:
            continue
        text = _get_value(block, "text") or _get_value(block, "content")
        if isinstance(text, str) and text:
            text_parts.append(text)
    if not text_parts:
        return None
    return "".join(text_parts)
