"""
Vision Service Provider.

Provides vision service access without tight coupling to session hierarchy.
"""

import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.core.interfaces.vision import IVisionProvider

logger = logging.getLogger(__name__)


class VisionServiceProvider:
    """
    Provides vision service access from session.

    Responsibility: Decouple ToolPreparer from session hierarchy.
    Encapsulates the access pattern for vision service.
    """

    @staticmethod
    def get_vision_service(session: "AgentSession") -> Optional["IVisionProvider"]:
        """
        Get vision service from session hierarchy.

        Args:
            session: Agent session with executor hierarchy

        Returns:
            Vision service instance or None if unavailable
        """
        try:
            context_factory = session.executor.tool_orchestrator.context_factory
            vision_service = getattr(
                context_factory,
                "vision_router",
                getattr(context_factory, "vision_service", None),
            )
            return vision_service
        except AttributeError as e:
            logger.debug(
                f"Could not access VisionService through session hierarchy: {e}",
                exc_info=True,
            )
            return None
