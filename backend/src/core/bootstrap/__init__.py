"""
Bootstrap Package.

Provides initialization components for application startup.
"""
import logging
from typing import Any, Tuple

from fastapi import FastAPI

from backend.src.core.bootstrap.coordinator import InitializationCoordinator
from backend.src.core.bootstrap.handler_initializer import HandlerInitializer
from backend.src.core.bootstrap.plugin_initializer import PluginInitializer

logger = logging.getLogger(__name__)


class Bootstrap:
    """
    Handles application startup and initialization.

    Acts as a facade that delegates to InitializationCoordinator
    for the actual initialization work.
    """

    def __init__(self):
        """Initialize the bootstrap."""
        self.coordinator = InitializationCoordinator()

    async def startup(self, app: FastAPI) -> Tuple[Any, Any, Any]:
        """
        Initialize all application components.

        Delegates to InitializationCoordinator for actual initialization.

        Args:
            app: FastAPI application instance

        Returns:
            Tuple of (container, session_manager, plugin_registry)
        """
        logger.info("Starting application bootstrap...")

        return await self.coordinator.initialize(app)


__all__ = [
    "Bootstrap",
    "InitializationCoordinator",
    "PluginInitializer",
    "HandlerInitializer",
]
