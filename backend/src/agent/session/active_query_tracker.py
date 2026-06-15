"""Active query task tracking for SessionManager."""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Optional

from backend.src.agent.session.conversation_refs import (
    normalize_optional_conversation_ref,
)

_PENDING_STOP_GRACE_SECONDS = 5.0

ACTIVE_QUERY_REGISTERED = "registered"
ACTIVE_QUERY_STOP_CONSUMED = "stop-consumed"
ACTIVE_QUERY_USER_LIMIT = "user-limit"
ACTIVE_QUERY_GLOBAL_LIMIT = "global-limit"

PendingStopKey = tuple[Optional[str], Optional[str]]


def normalize_optional_turn_ref(turn_ref: Optional[str]) -> Optional[str]:
    """Normalize optional turn refs to trimmed non-empty strings."""
    if not isinstance(turn_ref, str):
        return None
    normalized = turn_ref.strip()
    return normalized or None


def _pending_stop_key(
    conversation_ref: Optional[str],
    turn_ref: Optional[str],
) -> PendingStopKey:
    return (
        normalize_optional_conversation_ref(conversation_ref),
        normalize_optional_turn_ref(turn_ref),
    )


def _pending_stop_candidates(
    conversation_ref: Optional[str],
    turn_ref: Optional[str],
) -> list[PendingStopKey]:
    normalized_conversation_ref, normalized_turn_ref = _pending_stop_key(
        conversation_ref,
        turn_ref,
    )
    candidates: list[PendingStopKey] = []
    for candidate in (
        (normalized_conversation_ref, normalized_turn_ref),
        (normalized_conversation_ref, None),
        (None, normalized_turn_ref),
        (None, None),
    ):
        if candidate not in candidates:
            candidates.append(candidate)
    return candidates


class ActiveQueryTracker:
    """Track live query tasks and pending stop requests by user/conversation."""

    def __init__(self) -> None:
        self.active_query_tasks: dict[
            str, dict[asyncio.Task[Any], tuple[str, Optional[str]]]
        ] = {}
        self.pending_stop_requests: dict[str, dict[PendingStopKey, float]] = {}
        self._lock = threading.RLock()

    def register_pending_stop_request(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
        turn_ref: Optional[str] = None,
    ) -> None:
        with self._lock:
            key = _pending_stop_key(conversation_ref, turn_ref)
            user_pending = self.pending_stop_requests.setdefault(user_id, {})
            user_pending[key] = time.monotonic() + _PENDING_STOP_GRACE_SECONDS

    def consume_pending_stop_request(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
        turn_ref: Optional[str] = None,
    ) -> bool:
        with self._lock:
            user_pending = self.pending_stop_requests.get(user_id)
            if not user_pending:
                return False

            now = time.monotonic()
            for pending_key in _pending_stop_candidates(conversation_ref, turn_ref):
                expires_at = user_pending.get(pending_key)
                if expires_at is None:
                    continue
                if expires_at <= now:
                    user_pending.pop(pending_key, None)
                    continue
                user_pending.pop(pending_key, None)
                if not user_pending:
                    self.pending_stop_requests.pop(user_id, None)
                return True

            if not user_pending:
                self.pending_stop_requests.pop(user_id, None)
            return False

    def register_active_query_task(
        self,
        user_id: str,
        task: asyncio.Task[Any],
        *,
        turn_ref: str,
        conversation_ref: Optional[str] = None,
    ) -> bool:
        with self._lock:
            status = self.register_active_query_task_with_limits(
                user_id,
                task,
                turn_ref=turn_ref,
                conversation_ref=conversation_ref,
                max_active_queries_per_user=None,
                max_active_queries_global=None,
            )
            return status == ACTIVE_QUERY_STOP_CONSUMED

    def register_active_query_task_with_limits(
        self,
        user_id: str,
        task: asyncio.Task[Any],
        *,
        turn_ref: str,
        conversation_ref: Optional[str] = None,
        max_active_queries_per_user: Optional[int] = None,
        max_active_queries_global: Optional[int] = None,
    ) -> str:
        """Atomically apply active-query caps and register a task."""
        with self._lock:
            if (
                max_active_queries_per_user is not None
                and self.count_active_query_tasks(user_id)
                >= max_active_queries_per_user
            ):
                return ACTIVE_QUERY_USER_LIMIT
            if (
                max_active_queries_global is not None
                and self.count_active_query_tasks() >= max_active_queries_global
            ):
                return ACTIVE_QUERY_GLOBAL_LIMIT

            normalized_conversation_ref = normalize_optional_conversation_ref(
                conversation_ref
            )
            if self.consume_pending_stop_request(
                user_id,
                normalized_conversation_ref,
                turn_ref,
            ):
                return ACTIVE_QUERY_STOP_CONSUMED

            user_tasks = self.active_query_tasks.setdefault(user_id, {})
            user_tasks[task] = (turn_ref, normalized_conversation_ref)
            return ACTIVE_QUERY_REGISTERED

    def clear_active_query_task(
        self,
        user_id: str,
        task: Optional[asyncio.Task[Any]] = None,
    ) -> None:
        with self._lock:
            user_tasks = self.active_query_tasks.get(user_id)
            if not user_tasks:
                return

            if task is None:
                self.active_query_tasks.pop(user_id, None)
                return

            user_tasks.pop(task, None)
            if not user_tasks:
                self.active_query_tasks.pop(user_id, None)

    def cancel_active_query_task(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
        turn_ref: Optional[str] = None,
    ) -> Optional[tuple[str, Optional[str]]]:
        with self._lock:
            normalized_conversation_ref = normalize_optional_conversation_ref(
                conversation_ref
            )
            normalized_turn_ref = normalize_optional_turn_ref(turn_ref)
            user_tasks = self.active_query_tasks.get(user_id)
            if not user_tasks:
                self.register_pending_stop_request(
                    user_id,
                    normalized_conversation_ref,
                    normalized_turn_ref,
                )
                return None

            cancelled_entries: list[tuple[str, Optional[str]]] = []
            for active_task, (task_turn_ref, task_conversation_ref) in list(
                user_tasks.items()
            ):
                if active_task.done():
                    user_tasks.pop(active_task, None)
                    continue
                if (
                    normalized_conversation_ref is not None
                    and task_conversation_ref != normalized_conversation_ref
                ):
                    continue
                if (
                    normalized_turn_ref is not None
                    and task_turn_ref != normalized_turn_ref
                ):
                    continue
                active_task.cancel()
                user_tasks.pop(active_task, None)
                cancelled_entries.append((task_turn_ref, task_conversation_ref))

            if not user_tasks:
                self.active_query_tasks.pop(user_id, None)

            if not cancelled_entries:
                self.register_pending_stop_request(
                    user_id,
                    normalized_conversation_ref,
                    normalized_turn_ref,
                )
                return None

            pending = self.pending_stop_requests.get(user_id)
            if pending is not None:
                for pending_key in _pending_stop_candidates(
                    normalized_conversation_ref,
                    normalized_turn_ref,
                ):
                    pending.pop(pending_key, None)
                for cancelled_turn_ref, cancelled_conversation_ref in cancelled_entries:
                    for pending_key in _pending_stop_candidates(
                        cancelled_conversation_ref,
                        cancelled_turn_ref,
                    ):
                        pending.pop(pending_key, None)
                if not pending:
                    self.pending_stop_requests.pop(user_id, None)
            return cancelled_entries[-1]

    def has_active_query_task(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> bool:
        with self._lock:
            user_tasks = self.active_query_tasks.get(user_id)
            if not user_tasks:
                return False

            normalized_conversation_ref = normalize_optional_conversation_ref(
                conversation_ref
            )
            for task in list(user_tasks.keys()):
                if task.done():
                    user_tasks.pop(task, None)
                    continue
                _, task_conversation_ref = user_tasks[task]
                if (
                    normalized_conversation_ref is not None
                    and task_conversation_ref != normalized_conversation_ref
                ):
                    continue
                return True
            if not user_tasks:
                self.active_query_tasks.pop(user_id, None)
            return False

    def count_active_query_tasks(self, user_id: Optional[str] = None) -> int:
        with self._lock:
            if user_id is None:
                count = 0
                for candidate_user_id in list(self.active_query_tasks.keys()):
                    count += self.count_active_query_tasks(candidate_user_id)
                return count

            user_tasks = self.active_query_tasks.get(user_id)
            if not user_tasks:
                return 0

            count = 0
            for task in list(user_tasks.keys()):
                if task.done():
                    user_tasks.pop(task, None)
                    continue
                count += 1
            if not user_tasks:
                self.active_query_tasks.pop(user_id, None)
            return count

    def clear_user_state(self, user_id: str) -> None:
        with self._lock:
            self.clear_active_query_task(user_id)
            self.pending_stop_requests.pop(user_id, None)
