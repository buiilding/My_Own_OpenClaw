"""Active query task tracking for SessionManager."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

from backend.src.agent.session.conversation_refs import (
    normalize_optional_conversation_ref,
)

_PENDING_STOP_GRACE_SECONDS = 5.0


class ActiveQueryTracker:
    """Track live query tasks and pending stop requests by user/conversation."""

    def __init__(self) -> None:
        self.active_query_tasks: dict[
            str, dict[asyncio.Task[Any], tuple[str, Optional[str]]]
        ] = {}
        self.pending_stop_requests: dict[str, dict[Optional[str], float]] = {}

    def register_pending_stop_request(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> None:
        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
        user_pending = self.pending_stop_requests.setdefault(user_id, {})
        user_pending[normalized_conversation_ref] = (
            time.monotonic() + _PENDING_STOP_GRACE_SECONDS
        )

    def consume_pending_stop_request(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> bool:
        user_pending = self.pending_stop_requests.get(user_id)
        if not user_pending:
            return False

        now = time.monotonic()
        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
        candidate_keys = [normalized_conversation_ref]
        if normalized_conversation_ref is not None:
            candidate_keys.append(None)

        for pending_key in candidate_keys:
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
        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
        if self.consume_pending_stop_request(user_id, normalized_conversation_ref):
            return True
        user_tasks = self.active_query_tasks.setdefault(user_id, {})
        user_tasks[task] = (turn_ref, normalized_conversation_ref)
        return False

    def clear_active_query_task(
        self,
        user_id: str,
        task: Optional[asyncio.Task[Any]] = None,
    ) -> None:
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
    ) -> Optional[tuple[str, Optional[str]]]:
        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
        user_tasks = self.active_query_tasks.get(user_id)
        if not user_tasks:
            self.register_pending_stop_request(user_id, normalized_conversation_ref)
            return None

        cancelled_entries: list[tuple[str, Optional[str]]] = []
        for active_task, (turn_ref, task_conversation_ref) in list(user_tasks.items()):
            if active_task.done():
                user_tasks.pop(active_task, None)
                continue
            if (
                normalized_conversation_ref is not None
                and task_conversation_ref != normalized_conversation_ref
            ):
                continue
            active_task.cancel()
            user_tasks.pop(active_task, None)
            cancelled_entries.append((turn_ref, task_conversation_ref))

        if not user_tasks:
            self.active_query_tasks.pop(user_id, None)

        if not cancelled_entries:
            self.register_pending_stop_request(user_id, normalized_conversation_ref)
            return None

        if normalized_conversation_ref is None:
            self.pending_stop_requests.pop(user_id, None)
        else:
            pending = self.pending_stop_requests.get(user_id)
            if pending is not None:
                pending.pop(normalized_conversation_ref, None)
                if not pending:
                    self.pending_stop_requests.pop(user_id, None)
        return cancelled_entries[-1]

    def has_active_query_task(
        self,
        user_id: str,
        conversation_ref: Optional[str] = None,
    ) -> bool:
        user_tasks = self.active_query_tasks.get(user_id)
        if not user_tasks:
            return False

        normalized_conversation_ref = normalize_optional_conversation_ref(conversation_ref)
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

    def clear_user_state(self, user_id: str) -> None:
        self.clear_active_query_task(user_id)
        self.pending_stop_requests.pop(user_id, None)
