"""Session lifecycle operations."""
from __future__ import annotations

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
            session.response_parser.shutdown()
            session.history.clear()
            runtime = getattr(session, "runtime", None)
            if runtime is not None and hasattr(runtime, "clear"):
                runtime.clear()
            else:
                screenshot_state = getattr(session, "_screenshot_state", None)
                if screenshot_state is not None and hasattr(screenshot_state, "clear"):
                    screenshot_state.clear()

                resolved_storage = getattr(session, "_resolved_tool_call_storage", None)
                if resolved_storage is not None and hasattr(resolved_storage, "clear"):
                    resolved_storage.clear()

                result_storage = getattr(session, "_tool_result_storage", None)
                if result_storage is not None and hasattr(result_storage, "clear_all"):
                    result_storage.clear_all()

            # Legacy fields remain for external callers outside the agent package.
            for future in session._tool_result_futures.values():
                if not future.done():
                    future.cancel()
            session._tool_result_futures.clear()
            session._pending_tool_results.clear()
            session._bundled_results.clear()
            logger.debug("Session %s cleanup completed", session.session_id)
        except Exception as exc:
            logger.error(
                "Error during session cleanup for %s: %s",
                session.session_id,
                exc,
                exc_info=True,
            )
