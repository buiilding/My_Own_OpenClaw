"""
Task Management for WebSocket Connections.

Handles task tracking, cancellation, and concurrency limits.
"""
import asyncio
import logging
from typing import Set

from backend.src.api.transport.websocket import SafeWebSocket

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
    
    async def _remove_task_safely(self, task: asyncio.Task) -> None:
        """
        Remove task from active set with lock protection.
        
        This coroutine is scheduled from the task_done_callback to ensure
        thread-safe removal that doesn't race with disconnect cleanup iteration.
        """
        async with self.tasks_lock:
            self.active_tasks.discard(task)
    
    def task_done_callback(self, task: asyncio.Task):
        """
        Remove task from active set when done.
        
        NOTE: This callback runs synchronously from the task's context.
        To prevent race conditions with disconnect cleanup iteration, we schedule
        a coroutine to remove the task with proper lock protection.
        """
        # Schedule removal with lock protection to prevent race with iteration
        # The callback runs in the task's context (same event loop), so we can schedule
        try:
            # Get the running event loop (should be available since callback runs from task)
            loop = asyncio.get_running_loop()
            # Schedule the async removal function as a task
            # This ensures the lock is properly acquired before modifying the set
            loop.create_task(self._remove_task_safely(task))
        except RuntimeError:
            # SHUTDOWN CRASH FIX: During shutdown, loop may be closed/closing.
            # Fallback discard must be protected to prevent "Set changed size during iteration"
            # errors if cleanup is iterating. Wrap in try/except to handle
            # any RuntimeError from set mutation during iteration.
            try:
                self.active_tasks.discard(task)
            except RuntimeError:
                # Set is being iterated - ignore (cleanup will handle it)
                pass

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
            if len(self.active_tasks) >= self.max_concurrent_tasks:
                self._close_if_coroutine(coro)
                return None, True
            
            # Create task and add to set atomically within lock
            try:
                task = asyncio.create_task(coro)
            except Exception:
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
            self.active_tasks = {t for t in self.active_tasks if not t.done()}
