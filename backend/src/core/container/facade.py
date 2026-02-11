"""
Container Facade for backward compatibility.

This module provides a thin facade around ApplicationContainer for backward compatibility.
"""

import logging
from typing import Any, Optional

from dependency_injector import providers

from backend.src.core.config import AppConfig, ConfigManager, get_config_manager
from backend.src.core.container.api_runtime import ApiRuntimeBinder
from backend.src.core.container.application import ApplicationContainer
from backend.src.core.container.config_updater import ContainerConfigUpdater
from backend.src.core.container.initializer import ContainerInitializer
from backend.src.core.container.session_runtime import SessionRuntimeCoordinator

logger = logging.getLogger(__name__)


class Container:
    """
    Thin facade around ApplicationContainer for backward compatibility.

    Delegates initialization and config updates to specialized classes,
    keeping this class focused on providing a clean interface.
    """

    def __init__(self, config_manager: Optional[ConfigManager] = None):
        """
        Initialize the container wrapper.

        Args:
            config_manager: Optional ConfigManager instance. If None, uses the one from DI container.
                This allows proper DI while maintaining backward compatibility.
        """
        self._di_container = ApplicationContainer()

        # Inject config_manager via DI override if provided (proper DI pattern)
        # If None, use the global singleton for backward compatibility
        if config_manager is None:
            config_manager = get_config_manager()

        # Override the DI container's config_manager with the provided/global one
        # This is proper DI - using the framework's override mechanism
        self._di_container.config_manager.override(providers.Object(config_manager))

        # Load config at initialization
        self.config = self._di_container.config()

        # Initialize tool system (all dependencies properly wired via DI)
        self.tool_registry = self._di_container.tool_registry()
        self.context_factory = self._di_container.context_factory()
        self.agent_factory = self._di_container.agent_factory()

        # Initialize memory system
        self.embedder = self._di_container.embedder()

        # Vision service (from core container)
        self.vision_service = self._di_container.core.vision_service()
        self.ocr_service = self._di_container.core.ocr_service()

        # Core services (from core container)
        self.config_service = self._di_container.core.config_service()
        self.model_service = self._di_container.core.model_service()

        # Runtime coordinators (split from facade to reduce orchestration coupling)
        self._session_runtime = SessionRuntimeCoordinator(self)
        self._api_runtime = ApiRuntimeBinder(self)

        # Initialize specialized handlers
        self._initializer = ContainerInitializer(self)
        self._config_updater = ContainerConfigUpdater(self)

    @property
    def llm_client(self):
        """Get the LLM client from the DI container."""
        return self._di_container.llm_client()

    async def initialize(self):
        """
        Async initialization of components.

        Delegates to ContainerInitializer for actual initialization logic.
        """
        await self._initializer.initialize()

    async def update_config(self, config: AppConfig):
        """
        Update configuration for the container and its dependencies.

        Delegates to ContainerConfigUpdater for actual update logic.

        Args:
            config: New configuration instance
        """
        await self._config_updater.update_config(config)

    def create_agent_session(
        self,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
        config: Optional[
            Any
        ] = None,  # AppConfig - lazy import to avoid circular dependency
    ) -> Any:  # AgentSession - lazy import to avoid circular dependency
        """
        Create a new AgentSession with all dependencies injected.

        Delegates to AgentSessionFactory for actual session creation.
        Maintains backward compatibility while separating concerns.

        Args:
            user_id: User identifier
            session_id: Optional session identifier (generated if not provided)
            config: Optional configuration override. If provided, uses this instead of container's config.
                    This allows creating sessions with user-specific config without mutating container state.

        Returns:
            Initialized AgentSession
        """
        return self._session_runtime.create_agent_session(
            user_id=user_id,
            session_id=session_id,
            config=config,
        )

    @property
    def session_manager(self):
        """
        Get the session manager instance.

        Creates SessionManager lazily on first access with all dependencies injected.

        THREAD SAFETY: Uses double-checked locking pattern to prevent race conditions
        when multiple threads access this property simultaneously during startup.
        Without this, multiple SessionManager instances could be created, causing
        session state to be split across instances and leading to "lost" sessions.
        """
        return self._session_runtime.get_session_manager()

    @property
    def handler_registry(self):
        """
        Get the message handler registry.

        Creates ApiContainer and handler registry lazily on first access.
        """
        return self._api_runtime.get_handler_registry()

    def refresh_runtime_config(self, updated_config: AppConfig) -> None:
        """
        Refresh runtime-owned container references after config update.

        Keeps config-dependent service references aligned for existing lazy providers.
        """
        self.config = updated_config

        if self.tool_registry:
            self.tool_registry.config = updated_config
        if self.context_factory:
            self.context_factory.config = updated_config
            base_services = getattr(self.context_factory, "_base_services", None)
            if isinstance(base_services, dict):
                base_services["config"] = updated_config

        self._api_runtime.refresh_overrides()

    def invalidate_session_factory(self) -> None:
        """
        Invalidate cached AgentSessionFactory so future sessions use latest config.
        """
        self._session_runtime.invalidate_session_factory()
