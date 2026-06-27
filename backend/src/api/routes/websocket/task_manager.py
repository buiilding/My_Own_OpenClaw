"""
Task Management for WebSocket Connections.

Handles task tracking, cancellation, and concurrency limits.
"""

import asyncio
import logging
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any, Set

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TaskMetadata:
    """Diagnostic metadata for one websocket route-dispatch task."""

    message_type: str
    message_id: str | None = None
    conversation_ref: str | None = None
    turn_ref: str | None = None
    correlation_ref: str | None = None


@dataclass(frozen=True)
class ActiveTaskMetadata:
    """Diagnostic metadata attached to an admitted websocket task."""

    message_type: str
    message_id: str | None
    conversation_ref: str | None
    turn_ref: str | None
    correlation_ref: str | None
    started_monotonic: float

    @classmethod
    def from_task_metadata(cls, metadata: TaskMetadata | None) -> "ActiveTaskMetadata":
        metadata = metadata or TaskMetadata(message_type="unknown")
        return cls(
            message_type=metadata.message_type or "unknown",
            message_id=metadata.message_id,
            conversation_ref=metadata.conversation_ref,
            turn_ref=metadata.turn_ref,
            correlation_ref=metadata.correlation_ref,
            started_monotonic=time.monotonic(),
        )

    def to_log_dict(self, *, now: float) -> dict[str, Any]:
        return {
            "type": self.message_type,
            "id": self.message_id,
            "conversation_ref": self.conversation_ref,
            "turn_ref": self.turn_ref,
            "correlation_ref": self.correlation_ref,
            "age_seconds": round(max(0.0, now - self.started_monotonic), 3),
        }


class TaskManager:
    """
    Manages tasks for a WebSocket connection.

    Tracks active tasks, enforces concurrency limits, and handles cleanup.
    """

    def __init__(self, max_concurrent_tasks: int, task_cancellation_timeout: float):
        """
        Initialize task manager.

        Args:
            max_concurrent_tasks: Maximum concurrent tasks per connection
            task_cancellation_timeout: Timeout for task cancellation
        """
        self.max_concurrent_tasks = max_concurrent_tasks
        self.task_cancellation_timeout = task_cancellation_timeout
        self.active_tasks: Set[asyncio.Task] = set()
        self.active_task_metadata: dict[asyncio.Task, ActiveTaskMetadata] = {}
        self.tasks_lock = asyncio.Lock()

    def task_done_callback(self, task: asyncio.Task):
        """
        Remove task from active set when done.

        This callback runs in the event loop thread and performs an in-place
        discard to avoid creating a second cleanup task per completed request.
        """
        try:
            self.active_tasks.discard(task)
            self.active_task_metadata.pop(task, None)
        except RuntimeError:
            # Ignore set-iteration edge cases during shutdown; cleanup() prunes done tasks.
            pass

    def _prune_done_tasks_locked(self) -> int:
        """
        Remove completed tasks from active set.

        Must be called while holding ``tasks_lock``.
        """
        done_tasks = {task for task in self.active_tasks if task.done()}
        if done_tasks:
            self.active_tasks.difference_update(done_tasks)
            for task in done_tasks:
                self.active_task_metadata.pop(task, None)
        return len(done_tasks)

    def _active_task_diagnostics_locked(self, *, limit: int = 10) -> dict[str, Any]:
        """
        Build a compact active-task inventory.

        Must be called while holding ``tasks_lock``.
        """
        now = time.monotonic()
        records = []
        for task in self.active_tasks:
            if task.done():
                continue
            metadata = self.active_task_metadata.get(task)
            if metadata is None:
                metadata = ActiveTaskMetadata.from_task_metadata(None)
            records.append(metadata.to_log_dict(now=now))
        records.sort(key=lambda item: item["age_seconds"], reverse=True)
        by_type = Counter(str(record.get("type") or "unknown") for record in records)
        return {
            "active_count": len(records),
            "max_concurrent_tasks": self.max_concurrent_tasks,
            "by_type": dict(sorted(by_type.items())),
            "oldest": records[:limit],
        }

    async def active_task_diagnostics(self, *, limit: int = 10) -> dict[str, Any]:
        """Return a compact active-task inventory for rejection logging."""
        async with self.tasks_lock:
            self._prune_done_tasks_locked()
            return self._active_task_diagnostics_locked(limit=limit)

    @staticmethod
    def _close_if_coroutine(coro) -> None:
        """Close rejected coroutine inputs to avoid RuntimeWarning leaks."""
        close = getattr(coro, "close", None)
        if callable(close):
            try:
                close()
            except Exception as e:
                logger.debug(f"Ignoring coroutine close failure: {e}")

    async def create_task_if_under_limit(
        self,
        coro,
        user_id: str,
        metadata: TaskMetadata | None = None,
    ) -> bool:
        """
        Create task if under concurrency limit.

        Args:
            coro: Coroutine to run as task
            user_id: User ID for logging

        Returns:
            True when the coroutine was accepted and scheduled, False when the
            concurrency limit rejected it.
        """
        async with self.tasks_lock:
            pruned_count = self._prune_done_tasks_locked()
            if pruned_count:
                logger.debug(
                    "Pruned %d completed tasks before scheduling for user %s",
                    pruned_count,
                    user_id,
                )

            if len(self.active_tasks) >= self.max_concurrent_tasks:
                diagnostics = self._active_task_diagnostics_locked()
                logger.debug(
                    "Task limit exceeded for user %s (%d/%d): %s",
                    user_id,
                    len(self.active_tasks),
                    self.max_concurrent_tasks,
                    diagnostics,
                )
                self._close_if_coroutine(coro)
                return False

            # Create task and add to set atomically within lock
            try:
                task = asyncio.create_task(coro)
            except Exception as e:
                logger.debug(
                    "Failed to create task for user %s: %s",
                    user_id,
                    e,
                )
                self._close_if_coroutine(coro)
                raise
            self.active_tasks.add(task)
            self.active_task_metadata[task] = ActiveTaskMetadata.from_task_metadata(
                metadata
            )
            task.add_done_callback(self.task_done_callback)
            return True

    async def cleanup(self, user_id: str) -> None:
        """
        Clean up all pending tasks.

        Args:
            user_id: User ID for logging
        """
        # Get snapshot of pending tasks with lock to avoid race condition
        async with self.tasks_lock:
            pending = [t for t in self.active_tasks if not t.done()]
            diagnostics = self._active_task_diagnostics_locked()

        # Cancel all pending tasks
        for task in pending:
            task.cancel()

        # Wait for handlers to react to CancelledError
        if pending:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*pending, return_exceptions=True),
                    timeout=self.task_cancellation_timeout,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "Timeout waiting for %d tasks to cancel for user %s: %s",
                    len(pending),
                    user_id,
                    diagnostics,
                )

        # Force check for zombies (tasks that didn't respond to cancellation)
        zombies = [t for t in pending if not t.done()]
        if zombies:
            logger.error(
                "Orphaned %d tasks after cleanup for user %s: %s",
                len(zombies),
                user_id,
                diagnostics,
            )

        # Prune completed tasks deterministically in case callback-driven cleanup
        # is delayed or unavailable during shutdown/loop edge cases.
        async with self.tasks_lock:
            self._prune_done_tasks_locked()
