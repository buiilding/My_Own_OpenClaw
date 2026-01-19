"""
Dependency Injection Container using dependency-injector library.

This module handles the initialization and wiring of application components
using proper dependency injection patterns with container composition.
"""
import logging
from typing import Any, Optional

from dependency_injector import containers, providers

from backend.src.core.config import AppConfig, ConfigManager, get_config_manager
from backend.src.core.container.api_container import ApiContainer
from backend.src.core.container.config_updater import ContainerConfigUpdater
from backend.src.core.container.core_container import CoreContainer
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

    # Tool container (wired to core for config)
    tools = providers.Container(
        ToolContainer,
        config=core.config,
    )

    # Memory container (wired to core for config and cache_manager)
    memory = providers.Container(
        MemoryContainer,
        config=core.config,
        cache_manager=core.cache_manager,
    )

    # API container (will be created and wired in Container facade)
    # Note: Created in Container.__init__ to avoid circular dependency with session_manager

    # Expose commonly used providers at top level for convenience
    config_manager = core.config_manager
    config = core.config
    llm_client = core.llm_client
    tts_service = core.tts_service
    vision_service = core.vision_service
    config_service = core.config_service
    user_config_manager = core.user_config_manager
    model_service = core.model_service

    agent_factory = tools.agent_factory
    tool_registry = tools.tool_registry
    context_factory = tools.context_factory
    tool_orchestrator = tools.tool_orchestrator

    embedder = memory.embedder


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

        # Core services (from core container)
        self.config_service = self._di_container.core.config_service()
        self.user_config_manager = self._di_container.core.user_config_manager()
        self.model_service = self._di_container.core.model_service()

        # Plugin registry (set after bootstrap initialization)
        self._plugin_registry: Optional[Any] = None

        # Session factory (created lazily when plugin_registry is set)
        self._session_factory: Optional[AgentSessionFactory] = None

        # Session manager (created lazily after container is fully initialized)
        self._session_manager: Optional[Any] = None
        # CONTAINER LOCK INITIALIZATION RACE FIX: Initialize lock in __init__ to prevent race condition
        # when multiple threads access session_manager property simultaneously
        import threading
        self._session_manager_lock = threading.Lock()

        # API container (created after session_manager is available)
        self._api_container: Optional[Any] = None

        # Initialize specialized handlers
        self._initializer = ContainerInitializer(self)
        self._config_updater = ContainerConfigUpdater(self)

    @property
    def llm_client(self):
        """Get the LLM client from the DI container."""
        return self._di_container.llm_client()

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
        config: Optional[Any] = None,  # AppConfig - lazy import to avoid circular dependency
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
        # Create or get session factory
        if self._session_factory is None:
            self._session_factory = AgentSessionFactory(
                config=self.config,
                tool_registry=self.tool_registry,
                plugin_registry=self._plugin_registry,
                llm_client_factory=lambda: self._di_container.llm_client(),
                tool_orchestrator_factory=lambda: self._di_container.tool_orchestrator(),
                event_bus=self._di_container.core.event_bus(),
                metrics_service=self._di_container.core.metrics_service(),
            )

        return self._session_factory.create_session(
            user_id=user_id, session_id=session_id, config=config
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
        if self._session_manager is None:
            # CONTAINER LOCK INITIALIZATION RACE FIX: Lock is initialized in __init__,
            # so we can safely use it here without race condition
            # Double-checked locking pattern for thread-safe lazy initialization
            with self._session_manager_lock:
                # Check again after acquiring lock (another thread may have created it)
                if self._session_manager is None:
                    from backend.src.agent.core.session_manager import SessionManager
                    
                    self._session_manager = SessionManager(
                        config=self.config,
                        create_agent_session_func=self.create_agent_session,
                        user_config_manager=self.user_config_manager,
                    )
        return self._session_manager

    @property
    def handler_registry(self):
        """
        Get the message handler registry.
        
        Creates ApiContainer and handler registry lazily on first access.
        """
        if self._api_container is None:
            from dependency_injector import providers
            
            self._api_container = ApiContainer()
            
            # Wire dependencies from core container
            self._api_container.config.override(
                providers.Singleton(lambda: self.config)
            )
            self._api_container.config_service.override(
                providers.Singleton(lambda: self.config_service)
            )
            self._api_container.user_config_manager.override(
                providers.Singleton(lambda: self.user_config_manager)
            )
            self._api_container.model_service.override(
                providers.Singleton(lambda: self.model_service)
            )
            self._api_container.session_manager.override(
                providers.Singleton(lambda: self.session_manager)
            )
        
        return self._api_container.handler_registry()
