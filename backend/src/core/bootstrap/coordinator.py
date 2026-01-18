"""
Initialization Coordinator.

Coordinates the initialization phases of the application startup process.
"""
import logging
from typing import Any, Tuple

from fastapi import FastAPI

from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.deps import set_container
from backend.src.core.bootstrap.handler_initializer import HandlerInitializer
from backend.src.core.bootstrap.plugin_initializer import PluginInitializer
from backend.src.core.config import ConfigManager, get_config_manager
from backend.src.core.container import Container

logger = logging.getLogger(__name__)


class InitializationCoordinator:
    """
    Coordinates application initialization phases.

    Manages the initialization sequence:
    1. Configuration
    2. Container
    3. Services (SessionManager, Handlers)
    4. Plugins
    """

    def __init__(self):
        """Initialize the coordinator."""
        self.config_manager: ConfigManager = None
        self.config_service: Any = None
        self.container: Container = None
        self.session_manager: SessionManager = None
        self.plugin_initializer: PluginInitializer = None
        self.handler_initializer: HandlerInitializer = None

    async def initialize(
        self,
        app: FastAPI,
        config_manager: ConfigManager = None,
    ) -> Tuple[Container, SessionManager, Any]:
        """
        Initialize all application components in phases.

        Args:
            app: FastAPI application instance
            config_manager: Optional ConfigManager instance

        Returns:
            Tuple of (container, session_manager, plugin_registry)
        """
        # Phase 1: Configuration
        await self._initialize_configuration(config_manager)

        # Phase 2: Container
        await self._initialize_container()

        # Phase 3: Services (SessionManager, Handlers)
        await self._initialize_services()

        # Phase 4: Plugins
        plugin_registry = await self._initialize_plugins()

        logger.info("Application initialization complete.")

        return self.container, self.session_manager, plugin_registry

    async def _initialize_configuration(
        self, config_manager: ConfigManager = None
    ) -> None:
        """Phase 1: Initialize configuration."""
        logger.info("Phase 1: Initializing configuration...")

        self.config_manager = config_manager or get_config_manager()
        
        # Initialize PromptManager (required for PromptConstructor)
        from backend.src.llm.prompts import PromptManager
        PromptManager().initialize()
        
        logger.info("Configuration initialized.")

    async def _initialize_container(self) -> None:
        """Phase 2: Initialize container."""
        logger.info("Phase 2: Initializing container...")

        self.container = Container()
        await self.container.initialize()

        # Set container in DI system
        set_container(self.container)
        logger.info("Container initialized.")

    async def _initialize_services(self) -> None:
        """Phase 3: Initialize services (SessionManager, Handlers)."""
        logger.info("Phase 3: Initializing services...")

        # Get session manager from container (created lazily via property)
        self.session_manager = self.container.session_manager

        # Subscribe SessionManager to config changes
        config_service = self.container.config_service
        config_service.subscribe(self.session_manager)
        logger.info("SessionManager initialized and subscribed to config changes.")

        # Initialize handlers (now managed by DI container)
        self.handler_initializer = HandlerInitializer()
        await self.handler_initializer.initialize(self.container)
        logger.info("WebSocket message handlers initialized.")

    async def _initialize_plugins(self) -> Any:
        """Phase 4: Initialize plugins."""
        logger.info("Phase 4: Initializing plugins...")

        self.plugin_initializer = PluginInitializer()
        plugin_registry = await self.plugin_initializer.initialize(self.container)

        # Store plugin_registry in container for AgentSession creation
        self.container.plugin_registry = plugin_registry
        logger.info("Plugins initialized.")

        return plugin_registry
