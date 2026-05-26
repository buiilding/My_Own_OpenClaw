"""Backend-owned rendering for structured desktop query context."""

from __future__ import annotations

from typing import Any, Mapping, Optional
from xml.sax.saxutils import escape


def _escape_xml(value: Any) -> str:
    return escape(str(value or ""), {'"': "&quot;", "'": "&apos;"})


def _entries(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(entry) for entry in value if isinstance(entry, str)]


def _format_memory_section(tag_name: str, entries: list[str]) -> str:
    if not entries:
        return f"<{tag_name}>\nNone\n</{tag_name}>"
    section_text = "\n".join(f"- {_escape_xml(entry)}" for entry in entries)
    return f"<{tag_name}>\n{section_text}\n</{tag_name}>"


def _as_mapping(value: Any) -> Optional[Mapping[str, Any]]:
    if value is None:
        return None
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dumped if isinstance(dumped, Mapping) else None
    return None


def format_query_context_content(
    *,
    query: str,
    query_context: Optional[Any],
    fallback_content: Optional[str] = None,
) -> str:
    """Render backend-owned model-visible query content.

    `fallback_content` preserves compatibility for older clients that already
    send a fully formatted content string. New desktop clients send
    `query_context` and let this backend helper render the final prompt text.
    """

    context = _as_mapping(query_context)
    if context is None:
        if fallback_content:
            return fallback_content
        return f"<user_query>\n{_escape_xml(query)}\n</user_query>"

    parts: list[str] = []
    memory_enabled = context.get("memory_retrieval_enabled") is not False
    if memory_enabled:
        memories = _as_mapping(context.get("memories")) or {}
        parts.append(
            _format_memory_section("episodic_memory", _entries(memories.get("episodic")))
        )
        parts.append(
            _format_memory_section("semantic_memory", _entries(memories.get("semantic")))
        )

    attachment_context = context.get("attachment_context")
    if isinstance(attachment_context, str) and attachment_context.strip():
        parts.append(
            f"<attached_file_context>\n{_escape_xml(attachment_context)}\n</attached_file_context>"
        )

    parts.append(f"<user_query>\n{_escape_xml(query)}\n</user_query>")
    return "\n\n".join(parts)
