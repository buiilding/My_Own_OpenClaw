"""Shared helpers for text-bearing multimodal content blocks."""

from __future__ import annotations

from typing import Any, Iterable, Optional

from backend.src.core.types.enums import ContentType

TEXT_CONTENT_PART_TYPES = frozenset(
    {
        ContentType.TEXT.value,
        "input_text",
        "output_text",
    }
)
REFUSAL_CONTENT_PART_TYPE = "refusal"


def normalize_content_part_type(value: Any) -> str:
    """Normalize content-part type values to stripped strings."""
    if not isinstance(value, str):
        return ""
    return value.strip()


def _extract_text_like_value(value: Any) -> Optional[str]:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        nested = value.get("text") or value.get("content")
        if isinstance(nested, str) and nested:
            return nested
    return None


def extract_text_from_content_part(
    item: Any,
    *,
    include_refusal: bool = True,
) -> Optional[str]:
    """Extract visible text from one multimodal content part."""
    if not isinstance(item, dict):
        return None

    item_type = normalize_content_part_type(item.get("type"))
    if item_type in TEXT_CONTENT_PART_TYPES:
        return _extract_text_like_value(item.get("text")) or _extract_text_like_value(
            item.get("content")
        )

    if include_refusal and item_type == REFUSAL_CONTENT_PART_TYPE:
        return _extract_text_like_value(
            item.get("refusal")
        ) or _extract_text_like_value(item.get("text"))

    return None


def iter_text_content_fragments(
    content: Any,
    *,
    include_refusal: bool = True,
    stringify_scalars: bool = False,
) -> Iterable[str]:
    """Yield visible text fragments from plain or multimodal content."""
    if isinstance(content, str):
        if content:
            yield content
        return

    if isinstance(content, dict):
        text = extract_text_from_content_part(content, include_refusal=include_refusal)
        if text:
            yield text
        return

    if not isinstance(content, list):
        if (
            stringify_scalars
            and content is not None
            and not isinstance(content, (bytes, bytearray))
        ):
            rendered = str(content)
            if rendered:
                yield rendered
        return

    for item in content:
        if isinstance(item, str):
            if item:
                yield item
            continue
        text = extract_text_from_content_part(item, include_refusal=include_refusal)
        if text:
            yield text
