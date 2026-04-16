"""Session storage and lookup helpers for SessionManager."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import TYPE_CHECKING, Optional

from backend.src.agent.session.conversation_refs import (
    normalize_optional_conversation_ref,
)

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession


class SessionRegistry:
    """Own active session maps, per-user locks, and latest conversation refs."""

    def __init__(self) -> None:
        self.active_sessions: dict[str, dict[Optional[str], "AgentSession"]] = {}
        self.latest_conversation_refs: dict[str, Optional[str]] = {}
        self.active_connection_counts: dict[str, int] = {}
        self.user_locks: dict[str, asyncio.Lock] = {}
        self.locks_lock = asyncio.Lock()

    def get_user_sessions(
        self,
        user_id: str,
    ) -> dict[Optional[str], "AgentSession"]:
        """Return a normalized conversation->session map for a user."""
        raw_sessions = self.active_sessions.get(user_id)
        if raw_sessions is None:
            return {}
        if isinstance(raw_sessions, dict):
            return raw_sessions

        normalized_sessions = {None: raw_sessions}
        self.active_sessions[user_id] = normalized_sessions
        return normalized_sessions

    def iter_user_sessions(
        self,
        user_id: str,
    ) -> Iterable[tuple[Optional[str], "AgentSession"]]:
        return tuple(self.get_user_sessions(user_id).items())

    def iter_user_ids(self) -> Iterable[str]:
        return tuple(self.active_sessions.keys())

    def resolve_default_conversation_ref(
        self,
        user_id: str,
    ) -> Optional[str]:
        user_sessions = self.get_user_sessions(user_id)
        if not user_sessions:
            return None

        latest_conversation_ref = self.latest_conversation_refs.get(user_id)
        if latest_conversation_ref in user_sessions:
            return latest_conversation_ref
        if None in user_sessions:
            return None
        return next(iter(user_sessions.keys()))

    def get_session(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> Optional["AgentSession"]:
        user_sessions = self.get_user_sessions(user_id)
        if not user_sessions:
            return None

        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
        if (
            normalized_conversation_ref is not None
            and normalized_conversation_ref in user_sessions
        ):
            return user_sessions[normalized_conversation_ref]

        if normalized_conversation_ref is not None:
            return None

        fallback_conversation_ref = self.resolve_default_conversation_ref(user_id)
        return user_sessions.get(fallback_conversation_ref)

    def store_session(
        self,
        user_id: str,
        session: "AgentSession",
        *,
        conversation_ref: Optional[str] = None,
    ) -> None:
        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
        self.active_sessions.setdefault(user_id, {})[normalized_conversation_ref] = session
        self.latest_conversation_refs[user_id] = normalized_conversation_ref

    def remove_session(
        self,
        user_id: str,
        conversation_ref: Optional[str],
    ) -> Optional["AgentSession"]:
        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
        user_sessions = self.get_user_sessions(user_id)
        if not user_sessions:
            return None
        session = user_sessions.pop(normalized_conversation_ref, None)
        if user_sessions:
            self.latest_conversation_refs[user_id] = self.resolve_default_conversation_ref(
                user_id
            )
        else:
            self.active_sessions.pop(user_id, None)
            self.latest_conversation_refs.pop(user_id, None)
        return session

    def clear_user(self, user_id: str) -> None:
        self.active_sessions.pop(user_id, None)
        self.latest_conversation_refs.pop(user_id, None)

    def increment_connection_count(self, user_id: str) -> int:
        next_count = int(self.active_connection_counts.get(user_id, 0)) + 1
        self.active_connection_counts[user_id] = next_count
        return next_count

    def decrement_connection_count(self, user_id: str) -> int:
        current_count = int(self.active_connection_counts.get(user_id, 0))
        if current_count <= 1:
            self.active_connection_counts.pop(user_id, None)
            return 0
        next_count = current_count - 1
        self.active_connection_counts[user_id] = next_count
        return next_count

    def get_connection_count(self, user_id: str) -> int:
        return int(self.active_connection_counts.get(user_id, 0))

    async def get_user_lock(self, user_id: str) -> asyncio.Lock:
        """Get or create a lock for a specific user."""
        async with self.locks_lock:
            if user_id not in self.user_locks:
                self.user_locks[user_id] = asyncio.Lock()
            return self.user_locks[user_id]

    async def remove_user_lock(self, user_id: str) -> None:
        async with self.locks_lock:
            self.user_locks.pop(user_id, None)
