"""Session lifecycle operations."""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from backend.src.core.events.bus_events import InteractionCompleted

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


class SessionLifecycle:
    """Lifecycle hooks for AgentSession runtime resources."""

    @staticmethod
    async def cleanup(session: "AgentSession") -> None:
        """Release session resources and best-effort cancel background work."""
        logger.debug("Cleaning up session %s for user %s", session.session_id, session.user_id)
        try:
            session.event_bus.unsubscribe(InteractionCompleted, session._on_interaction_completed)
            session.history.clear()
            runtime = getattr(session, "runtime", None)
            if runtime is not None and hasattr(runtime, "drain_background_tasks"):
                tasks = runtime.drain_background_tasks()
                for task in tasks:
                    if not task.done():
                        task.cancel()
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
            if runtime is not None and hasattr(runtime, "clear"):
                runtime.clear()
            logger.debug("Session %s cleanup completed", session.session_id)
        except Exception as exc:
            logger.error(
                "Error during session cleanup for %s: %s",
                session.session_id,
                exc,
                exc_info=True,
            )
