"""
Container Config Updater.

Handles configuration updates for container components.
"""
import logging
from typing import Any

from dependency_injector import providers

from backend.src.core.config import AppConfig
from backend.src.core.container.factories import _create_embedder

logger = logging.getLogger(__name__)


class ContainerConfigUpdater:
    """
    Handles configuration updates for container components.

    Separates config update logic from DI container configuration.
    """

    def __init__(self, container: Any):
        """
        Initialize the config updater.

        Args:
            container: Container instance to update
        """
        self.container = container

    async def update_config(self, config: AppConfig) -> None:
        """
        Update configuration for the container and its dependencies.

        Args:
            config: New configuration instance
        """
        # Update config service first (handles ConfigManager update and notifications)
        # This ensures all subscribers are notified and EventBus events are published
        config_service = self.container.config_service
        if config_service:
            updated_config = await config_service.update_config(config)
        else:
            # Fallback if config_service is not available
            config_manager = self.container._di_container.config_manager()
            updated_config = config_manager.update_config(config)

        # Update container's config
        self.container.config = updated_config

        # Update model service (recreate with new config)
        # ModelService stores config in __init__, so we need to recreate it
        from backend.src.llm.models import ModelService
        self.container.model_service = self.container._di_container.core.model_service.override(
            providers.Singleton(
                ModelService,
                config=providers.Singleton(lambda: updated_config),
            )
        )()

        # Update tool registry config
        if self.container.tool_registry:
            self.container.tool_registry.config = updated_config

        # Re-initialize embedder if memory enabled status changed
        # Memory storage is now handled by frontend, but backend still handles embeddings
        if updated_config.memory_enabled and not self.container.embedder:
            # Re-create embedder
            self._reinitialize_embedder(updated_config)

        logger.info("Container configuration updated")

    def _reinitialize_embedder(self, config: AppConfig) -> None:
        """
        Re-initialize embedder component with new configuration.

        Args:
            config: New configuration instance
        """
        # Re-create embedder
        self.container.embedder = self.container._di_container.embedder.override(
            providers.Singleton(
                lambda cfg: _create_embedder(cfg),
                cfg=providers.Singleton(lambda: config),
            )
        )()
