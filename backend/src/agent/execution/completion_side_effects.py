"""Completed-turn side effects for agent execution."""

from __future__ import annotations

import html
import logging
import re

from backend.src.core.events.bus_events import InteractionCompleted

logger = logging.getLogger(__name__)

_USER_QUERY_TAG_PATTERN = re.compile(
    r"<user_query>\s*(.*?)\s*</user_query>",
    re.IGNORECASE | re.DOTALL,
)
_USER_QUERY_PARSE_MAX_CHARS = 300_000


async def publish_and_emit_completion_side_effects(
    *,
    session,
    event_bus,
    raw_user_query: str,
    final_response: str,
) -> None:
    """Publish backend completion bookkeeping."""
    completion_event = InteractionCompleted(
        session_id=session.session_id,
        user_id=session.user_id,
        user_message=raw_user_query,
        assistant_response=final_response,
    )
    await event_bus.publish(completion_event)


def resolve_raw_user_query(query: str, final_content: str) -> str:
    """
    Resolve user-typed query text from formatted content when possible.

    The client sends a rich `message_content` envelope that includes
    memory sections and `<user_query>`. We store
    only the user query text in history metadata/memory events.
    """
    fallback = (query or "").strip()
    if not final_content:
        return fallback

    search_space = final_content[:_USER_QUERY_PARSE_MAX_CHARS]
    match = None
    for candidate in _USER_QUERY_TAG_PATTERN.finditer(search_space):
        match = candidate
    if not match:
        return fallback

    extracted = html.unescape((match.group(1) or "").strip())
    return extracted or fallback
