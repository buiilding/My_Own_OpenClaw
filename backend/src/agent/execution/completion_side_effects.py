"""Completed-turn side effects for agent execution."""

from __future__ import annotations

import asyncio
import html
import logging
import re
from typing import AsyncGenerator

from backend.src.core.events import InteractionCompleted, MemoryStoreEvent

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
) -> AsyncGenerator[MemoryStoreEvent, None]:
    """Publish completion bookkeeping and emit one interaction-memory event."""
    completion_event = InteractionCompleted(
        session_id=session.session_id,
        user_id=session.user_id,
        user_message=raw_user_query,
        assistant_response=final_response,
    )
    await event_bus.publish(completion_event)

    memory_event = MemoryStoreEvent(
        user_query=raw_user_query,
        assistant_response=final_response,
        memory_type="episodic",
        user_id=session.user_id,
        session_id=(
            session.runtime.active_conversation_ref
            or session.session_id
        ),
    )

    try:
        yield memory_event
    except GeneratorExit:
        logger.warning(
            "Client disconnected before MemoryStoreEvent could be yielded. "
            "Publishing to event bus as fallback."
        )
        session.register_background_task(
            asyncio.create_task(event_bus.publish(memory_event))
        )


def resolve_raw_user_query(query: str, final_content: str) -> str:
    """
    Resolve user-typed query text from formatted content when possible.

    The frontend sends a rich `message_content` envelope that includes
    `<system_context>`, memory sections, and `<user_query>`. We store
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
