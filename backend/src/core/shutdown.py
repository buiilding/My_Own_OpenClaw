"""
Application Shutdown Module.

Handles graceful shutdown of all application components.
"""
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


class Shutdown:
    """
    Handles application shutdown and cleanup.
    """

    async def shutdown(
        self, plugin_registry: Any, background_task: asyncio.Task
    ) -> None:
        """
        Shutdown all application components.

        Args:
            plugin_registry: Plugin registry instance
            background_task: Background task to cancel
        """
        logger.info("Shutting down...")

        # Shutdown plugins
        await plugin_registry.shutdown_all_plugins()

        # Cancel background task
        background_task.cancel()

        logger.info("Shutdown complete.")
