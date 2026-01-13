"""
Handler Initializer.

Handles WebSocket message handler initialization.
"""
import logging

from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.handlers import initialize_handlers

logger = logging.getLogger(__name__)


class HandlerInitializer:
    """
    Initializes WebSocket message handlers.

    Handles registration of all message handlers with the handler registry.
    """

    async def initialize(self, session_manager: SessionManager) -> None:
        """
        Initialize and register all WebSocket message handlers.

        Args:
            session_manager: SessionManager instance for handlers
        """
        initialize_handlers(session_manager)
        logger.info("WebSocket message handlers initialized.")
