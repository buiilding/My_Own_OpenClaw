"""
Container Config Updater.

Handles configuration updates for container components.
"""
import logging
from typing import Any

from dependency_injector import providers

from backend.src.core.config import AppConfig
from backend.src.core.container.factories import _create_embedder, _create_memory_store

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

    def update_config(self, config: AppConfig) -> None:
        """
        Update configuration for the container and its dependencies.

        Args:
            config: New configuration instance
        """
        # Update config manager
        config_manager = self.container._di_container.config_manager()
        updated_config = config_manager.update_config(config)

        # Update container's config
        self.container.config = updated_config

        # Update tool loader and registry
        self.container.tool_loader.config = updated_config
        if self.container.tool_registry:
            self.container.tool_registry.config = updated_config

        # Re-initialize memory if enabled status changed
        # This is a simplification; in production you might want to handle this more gracefully
        if updated_config.memory_enabled and not self.container.memory_store:
            # Re-create memory components
            self._reinitialize_memory_components(updated_config)

        logger.info("Container configuration updated")

    def _reinitialize_memory_components(self, config: AppConfig) -> None:
        """
        Re-initialize memory components with new configuration.

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

        # Re-create memory store
        self.container.memory_store = (
            self.container._di_container.memory_store.override(
                providers.Singleton(
                    lambda cfg, emb: _create_memory_store(cfg, emb),
                    cfg=providers.Singleton(lambda: config),
                    emb=self.container._di_container.embedder,
                )
            )()
        )
