"""
Task Management for WebSocket Connections.

Handles task tracking, cancellation, and concurrency limits.
"""
import asyncio
import logging
from typing import Set

logger = logging.getLogger(__name__)


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
        self.tasks_lock = asyncio.Lock()
    
    def task_done_callback(self, task: asyncio.Task):
        """
        Remove task from active set when done.

        This callback runs in the event loop thread and performs an in-place
        discard to avoid creating a second cleanup task per completed request.
        """
        try:
            self.active_tasks.discard(task)
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
        return len(done_tasks)

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
        user_id: str
    ) -> tuple[asyncio.Task | None, bool]:
        """
        Create task if under concurrency limit.
        
        Args:
            coro: Coroutine to run as task
            user_id: User ID for logging
            
        Returns:
            Tuple of (task or None, limit_exceeded: bool)
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
                logger.debug(
                    "Task limit exceeded for user %s (%d/%d)",
                    user_id,
                    len(self.active_tasks),
                    self.max_concurrent_tasks,
                )
                self._close_if_coroutine(coro)
                return None, True
            
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
            task.add_done_callback(self.task_done_callback)
            return task, False
    
    async def cleanup(self, user_id: str) -> None:
        """
        Clean up all pending tasks.
        
        Args:
            user_id: User ID for logging
        """
        # Get snapshot of pending tasks with lock to avoid race condition
        async with self.tasks_lock:
            pending = [t for t in self.active_tasks if not t.done()]
        
        # Cancel all pending tasks
        for task in pending:
            task.cancel()
        
        # Wait for handlers to react to CancelledError
        if pending:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*pending, return_exceptions=True),
                    timeout=self.task_cancellation_timeout
                )
            except asyncio.TimeoutError:
                logger.warning(f"Timeout waiting for {len(pending)} tasks to cancel")
        
        # Force check for zombies (tasks that didn't respond to cancellation)
        zombies = [t for t in pending if not t.done()]
        if zombies:
            logger.error(f"Orphaned {len(zombies)} tasks after cleanup for user {user_id}")

        # Prune completed tasks deterministically in case callback-driven cleanup
        # is delayed or unavailable during shutdown/loop edge cases.
        async with self.tasks_lock:
            self._prune_done_tasks_locked()
