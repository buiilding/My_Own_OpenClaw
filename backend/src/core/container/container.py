"""
Dependency Injection Container using dependency-injector library.

This module handles the initialization and wiring of application components
using proper dependency injection patterns with container composition.
"""
import logging
from typing import Any, Optional

from dependency_injector import containers, providers

from backend.src.core.config import AppConfig, ConfigManager, get_config_manager
from backend.src.core.container.config_updater import ContainerConfigUpdater
from backend.src.core.container.core_container import CoreContainer
from backend.src.core.container.factories import _create_tool_instantiator
from backend.src.core.container.initializer import ContainerInitializer
from backend.src.core.container.memory_container import MemoryContainer
from backend.src.core.container.session_factory import AgentSessionFactory
from backend.src.core.container.tool_container import ToolContainer

logger = logging.getLogger(__name__)


class ApplicationContainer(containers.DeclarativeContainer):
    """
    Main application container using dependency injection composition.

    This container orchestrates the entire application's dependency graph using
    domain-driven design principles. It composes specialized containers for
    different functional areas, providing clean separation of concerns and
    improved testability.

    Container Composition:
    - CoreContainer: Foundation services (config, LLM, TTS, core services)
    - ToolContainer: Tool system (registry, orchestrator, loaders)
    - MemoryContainer: Memory system (embeddings, storage, retrieval)

    Key Benefits:
    - Clear dependency boundaries between domains
    - Easy testing through container overrides
    - Runtime reconfiguration capabilities
    - Lazy initialization of expensive resources
    - Centralized dependency management

    Usage:
        container = ApplicationContainer()
        await container.initialize()

        # Access components
        agent = container.agent_session_factory("user123")
        llm_client = container.core.llm_client()
    """

    # Core container (provides config, services, LLM, TTS)
    core = providers.Container(CoreContainer)

    # Tool container (wired to core for config and services)
    tools = providers.Container(
        ToolContainer,
        config=core.config,
        service_container=core.service_container,
    )

    # Memory container (wired to core for config)
    memory = providers.Container(
        MemoryContainer,
        config=core.config,
    )

    # Expose commonly used providers at top level for convenience
    config_manager = core.config_manager
    config = core.config
    service_container = core.service_container
    llm_client = core.llm_client
    tts_service = core.tts_service
    vision_service = core.vision_service

    tool_instantiator = tools.tool_instantiator
    tool_loader = tools.tool_loader
    agent_factory = tools.agent_factory
    tool_registry = tools.tool_registry
    context_factory = tools.context_factory
    tool_search_engine = tools.tool_search_engine
    tool_orchestrator = tools.tool_orchestrator

    embedder = memory.embedder
    memory_store = memory.memory_store


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

        # Initialize service layer
        self.service_container = self._di_container.service_container()

        # Initialize tool system (all dependencies properly wired via DI)
        # The DI container handles the dependency order automatically:
        # instantiator -> loader -> registry -> search_engine
        # Then we wire search_engine back into instantiator via DI override
        self.tool_registry = self._di_container.tool_registry()
        self.context_factory = self._di_container.context_factory()
        self.tool_search_engine = self._di_container.tool_search_engine()
        self.agent_factory = self._di_container.agent_factory()

        # Properly wire search_engine into instantiator via DI (no manual assignment)
        # This completes the dependency cycle using proper DI patterns
        self._di_container.tools.tool_instantiator.override(
            providers.Singleton(
                lambda: _create_tool_instantiator(self.tool_search_engine)
            )
        )

        # Get tool_loader (will use updated instantiator with search_engine)
        self.tool_loader = self._di_container.tool_loader()

        # Initialize memory system
        self.memory_store = self._di_container.memory_store()
        self.embedder = self._di_container.embedder()

        # Vision service (from core container)
        self.vision_service = self._di_container.core.vision_service()

        # Plugin registry (set after bootstrap initialization)
        self._plugin_registry: Optional[Any] = None

        # Session factory (created lazily when plugin_registry is set)
        self._session_factory: Optional[AgentSessionFactory] = None

        # Initialize specialized handlers
        self._initializer = ContainerInitializer(self)
        self._config_updater = ContainerConfigUpdater(self)

    @property
    def plugin_registry(self) -> Optional[Any]:
        """Get the plugin registry."""
        return self._plugin_registry

    @plugin_registry.setter
    def plugin_registry(self, value: Any) -> None:
        """Set the plugin registry and recreate session factory."""
        self._plugin_registry = value
        # Reset factory so it's recreated with new plugin_registry
        self._session_factory = None

    async def initialize(self):
        """
        Async initialization of components.

        Delegates to ContainerInitializer for actual initialization logic.
        """
        await self._initializer.initialize()

    def update_config(self, config: AppConfig):
        """
        Update configuration for the container and its dependencies.

        Delegates to ContainerConfigUpdater for actual update logic.

        Args:
            config: New configuration instance
        """
        self._config_updater.update_config(config)

    def create_agent_session(
        self, user_id: str = "default_user", session_id: Optional[str] = None
    ) -> Any:  # AgentSession - lazy import to avoid circular dependency
        """
        Create a new AgentSession with all dependencies injected.

        Delegates to AgentSessionFactory for actual session creation.
        Maintains backward compatibility while separating concerns.

        Args:
            user_id: User identifier
            session_id: Optional session identifier (generated if not provided)

        Returns:
            Initialized AgentSession
        """
        # Create or get session factory
        if self._session_factory is None:
            self._session_factory = AgentSessionFactory(
                config=self.config,
                memory_store=self.memory_store,
                embedder=self.embedder,
                tool_registry=self.tool_registry,
                plugin_registry=self._plugin_registry,
                llm_client_factory=lambda: self._di_container.llm_client(),
                tool_orchestrator_factory=lambda: self._di_container.tool_orchestrator(),
            )

        return self._session_factory.create_session(
            user_id=user_id, session_id=session_id
        )
