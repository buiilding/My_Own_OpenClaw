"""Terminal event policy helpers for query execution streams."""

from __future__ import annotations

POST_TERMINAL_ALLOWED_EVENT_TYPES = frozenset({
    "memory-store",
})


def is_post_terminal_event_allowed(event_type: str | None) -> bool:
    """Return whether a post-terminal event should still flow through the pipeline."""
    if not event_type:
        return False
    return event_type in POST_TERMINAL_ALLOWED_EVENT_TYPES
