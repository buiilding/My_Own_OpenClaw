"""
Handler Initializer.

Handles WebSocket message handler initialization.
"""
import logging

from backend.src.core.container import Container

logger = logging.getLogger(__name__)


class HandlerInitializer:
    """
    Initializes WebSocket message handlers.

    Handlers are now managed by the DI container (ApiContainer),
    so this initializer just ensures the handler registry is created.
    """

    async def initialize(self, container: Container) -> None:
        """
        Initialize handler registry from container.

        Args:
            container: Container instance with handler registry
        """
        # Access handler registry to trigger lazy creation
        _ = container.handler_registry
        logger.info("WebSocket message handlers initialized via DI container.")
