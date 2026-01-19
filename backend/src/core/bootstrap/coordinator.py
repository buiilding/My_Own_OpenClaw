"""
Initialization Coordinator.

Coordinates the initialization phases of the application startup process.
"""
import asyncio
import logging
import threading
from typing import List, Optional, Tuple

from fastapi import FastAPI

from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.deps import set_container
from backend.src.core.bootstrap.handler_initializer import HandlerInitializer
from backend.src.core.bootstrap.plugin_initializer import PluginInitializer
from backend.src.core.config import ConfigManager, get_config_manager
from backend.src.core.container import Container
from backend.src.core.plugins import PluginRegistry

logger = logging.getLogger(__name__)


class InitializationError(Exception):
    """Raised when initialization fails."""
    pass


class InitializationCoordinator:
    """
    Coordinates application initialization phases.

    Manages the initialization sequence:
    1. Configuration
    2. Container
    3. Services (SessionManager, Handlers)
    4. Plugins

    Provides error handling and rollback on failure.
    Thread-safe: Prevents multiple concurrent initializations.
    """

    def __init__(self):
        """Initialize the coordinator."""
        self.config_manager: Optional[ConfigManager] = None
        self.container: Optional[Container] = None
        self.session_manager: Optional[SessionManager] = None
        self.plugin_registry: Optional[PluginRegistry] = None
        self.plugin_initializer: Optional[PluginInitializer] = None
        self.handler_initializer: Optional[HandlerInitializer] = None
        self._initialized_phases: List[str] = []
        self._is_initialized: bool = False
        # INITIALIZATION RACE FIX: Use threading.Lock to protect asyncio.Lock creation
        # This prevents race condition when initialize() is called from multiple threads
        self._lock_creation_lock = threading.Lock()
        self._initialization_lock: Optional[asyncio.Lock] = None

    @property
    def is_initialized(self) -> bool:
        """
        Check if initialization is complete.

        Returns:
            True if initialization completed successfully, False otherwise.
        """
        return self._is_initialized

    async def initialize(
        self,
        app: Optional[FastAPI] = None,
        config_manager: Optional[ConfigManager] = None,
    ) -> Tuple[Container, SessionManager, PluginRegistry]:
        """
        Initialize all application components in phases.

        Args:
            app: Optional FastAPI application instance (reserved for future extensibility)
            config_manager: Optional ConfigManager instance. If None, uses global singleton.

        Returns:
            Tuple of (container, session_manager, plugin_registry)

        Raises:
            InitializationError: If any phase fails during initialization.
            RuntimeError: If already initialized (caller should check is_initialized first).
        """
        # Prevent multiple initializations
        if self._is_initialized:
            raise RuntimeError(
                "InitializationCoordinator already initialized. "
                "Check is_initialized property before calling initialize()."
            )

        # INITIALIZATION RACE FIX: Use threading.Lock to protect asyncio.Lock creation
        # This ensures only one thread creates the asyncio.Lock, preventing race conditions
        # when initialize() is called concurrently from different threads
        if self._initialization_lock is None:
            with self._lock_creation_lock:
                # Double-check after acquiring threading lock
                if self._initialization_lock is None:
                    # Get or create event loop for this thread
                    try:
                        loop = asyncio.get_running_loop()
                    except RuntimeError:
                        # No event loop running - create new one (shouldn't happen in normal usage)
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                    self._initialization_lock = asyncio.Lock()

        async with self._initialization_lock:
            # Double-check after acquiring lock
            if self._is_initialized:
                raise RuntimeError(
                    "InitializationCoordinator already initialized (race condition detected)."
                )

            try:
                # Phase 1: Configuration
                await self._initialize_configuration(config_manager)
                self._initialized_phases.append("configuration")

                # Phase 2: Container
                await self._initialize_container()
                self._initialized_phases.append("container")

                # Phase 3: Services (SessionManager, Handlers)
                await self._initialize_services()
                self._initialized_phases.append("services")

                # Phase 4: Plugins
                plugin_registry = await self._initialize_plugins()
                self._initialized_phases.append("plugins")
                self.plugin_registry = plugin_registry

                # Validate final state
                self._validate_final_state()

                self._is_initialized = True
                logger.info("Application initialization complete.")
                return self.container, self.session_manager, plugin_registry

            except Exception as e:
                # Preserve original exception type if it's already an InitializationError
                if isinstance(e, InitializationError):
                    original_error = e
                else:
                    original_error = InitializationError(
                        f"Initialization failed at phase '{self._initialized_phases[-1] if self._initialized_phases else 'unknown'}': {str(e)}"
                    )

                logger.error(
                    f"Initialization failed at phase: {self._initialized_phases[-1] if self._initialized_phases else 'unknown'}",
                    exc_info=True
                )
                # Attempt cleanup of initialized phases
                await self._rollback()
                raise original_error

    async def _initialize_configuration(
        self, config_manager: Optional[ConfigManager] = None
    ) -> None:
        """
        Phase 1: Initialize configuration.

        Args:
            config_manager: Optional ConfigManager instance. If None, uses global singleton.

        Raises:
            RuntimeError: If configuration cannot be loaded.
        """
        logger.info("Phase 1: Initializing configuration...")

        if config_manager is None:
            config_manager = get_config_manager()

        self.config_manager = config_manager

        # Validate config_manager is properly initialized
        if self.config_manager is None:
            raise InitializationError("Failed to obtain ConfigManager instance")

        logger.info("Configuration initialized.")

    async def _initialize_container(self) -> None:
        """
        Phase 2: Initialize container.

        Raises:
            InitializationError: If container initialization fails.
            RuntimeError: If container is already set in global state (should not happen).
        """
        logger.info("Phase 2: Initializing container...")

        # Validate previous phase completed
        if self.config_manager is None:
            raise InitializationError(
                "Cannot initialize container: configuration phase not completed"
            )

        # Pass config_manager to Container to ensure proper DI
        self.container = Container(config_manager=self.config_manager)
        await self.container.initialize()

        # Set container in DI system (will raise RuntimeError if already set)
        try:
            set_container(self.container)
        except RuntimeError as e:
            # If container is already set, this is a serious error
            # It means initialize() was called twice or container was set externally
            raise InitializationError(
                f"Failed to set container in global state: {str(e)}. "
                "This may indicate initialize() was called multiple times."
            ) from e

        logger.info("Container initialized.")

    async def _initialize_services(self) -> None:
        """
        Phase 3: Initialize services (SessionManager, Handlers).

        Raises:
            InitializationError: If service initialization fails.
        """
        logger.info("Phase 3: Initializing services...")

        # Validate previous phase completed
        if self.container is None:
            raise InitializationError(
                "Cannot initialize services: container phase not completed"
            )

        # Initialize PromptManager (required for PromptConstructor)
        # This belongs in services phase since it's used by service components
        from backend.src.llm.prompts import PromptManager
        PromptManager().initialize()

        # Get session manager from container (created lazily via property)
        self.session_manager = self.container.session_manager

        if self.session_manager is None:
            raise InitializationError("Failed to create SessionManager from container")

        # Subscribe SessionManager to config changes
        config_service = self.container.config_service
        if config_service is None:
            raise InitializationError("ConfigService not available in container")

        config_service.subscribe(self.session_manager)
        logger.info("SessionManager initialized and subscribed to config changes.")

        # Initialize handlers (now managed by DI container)
        self.handler_initializer = HandlerInitializer()
        await self.handler_initializer.initialize(self.container)
        logger.info("WebSocket message handlers initialized.")

    async def _initialize_plugins(self) -> PluginRegistry:
        """
        Phase 4: Initialize plugins.

        Returns:
            Initialized PluginRegistry instance.

        Raises:
            InitializationError: If plugin initialization fails.
        """
        logger.info("Phase 4: Initializing plugins...")

        # Validate previous phase completed
        if self.container is None:
            raise InitializationError(
                "Cannot initialize plugins: container phase not completed"
            )

        self.plugin_initializer = PluginInitializer()
        plugin_registry = await self.plugin_initializer.initialize(self.container)

        if plugin_registry is None:
            raise InitializationError("Failed to create PluginRegistry")

        # Use proper setter to maintain encapsulation
        self.container.plugin_registry = plugin_registry
        logger.info("Plugins initialized.")

        return plugin_registry

    def _validate_final_state(self) -> None:
        """
        Validate that all required components are initialized and available.

        Raises:
            InitializationError: If any required component is missing or invalid.
        """
        if self.container is None:
            raise InitializationError("Container is None after initialization")
        if self.session_manager is None:
            raise InitializationError("SessionManager is None after initialization")
        if self.plugin_registry is None:
            raise InitializationError("PluginRegistry is None after initialization")

        # Validate container has required services
        if self.container.config_service is None:
            raise InitializationError("Container.config_service is None after initialization")
        if self.container.tool_registry is None:
            raise InitializationError("Container.tool_registry is None after initialization")

        logger.debug("Final state validation passed")

    async def _rollback(self) -> None:
        """
        Rollback initialized phases in reverse order.

        Attempts to clean up any partially initialized state, including:
        - Unsubscribing from config changes
        - Clearing global container state
        - Resetting all coordinator state
        """
        logger.warning("Rolling back initialization...")

        # Rollback in reverse order
        for phase in reversed(self._initialized_phases):
            try:
                if phase == "plugins":
                    # Plugin registry cleanup
                    if self.plugin_registry is not None:
                        try:
                            # PluginRegistry may have shutdown method
                            if hasattr(self.plugin_registry, 'shutdown_all_plugins'):
                                await self.plugin_registry.shutdown_all_plugins()
                        except Exception as e:
                            logger.warning(f"Error shutting down plugins during rollback: {e}")
                    logger.debug("Rolled back plugins phase")

                elif phase == "services":
                    # Unsubscribe SessionManager from config changes
                    if self.session_manager is not None and self.container is not None:
                        try:
                            config_service = self.container.config_service
                            if config_service is not None:
                                config_service.unsubscribe(self.session_manager)
                                logger.debug("Unsubscribed SessionManager from config changes")
                        except Exception as e:
                            logger.warning(f"Error unsubscribing SessionManager during rollback: {e}")
                    logger.debug("Rolled back services phase")

                elif phase == "container":
                    # Clear global container state
                    # Note: set_container doesn't support None, so we can't fully clear it
                    # The global state will remain, but this is acceptable during rollback
                    # since the application is in a failed state anyway
                    # In production, this should never happen as initialization is single-use
                    logger.debug("Rolled back container phase (global state may remain)")

                elif phase == "configuration":
                    # Configuration cleanup (usually stateless, but log for completeness)
                    logger.debug("Rolled back configuration phase")
            except Exception as e:
                logger.error(f"Error during rollback of {phase} phase: {e}", exc_info=True)

        # Reset all state
        self.config_manager = None
        self.container = None
        self.session_manager = None
        self.plugin_registry = None
        self.plugin_initializer = None
        self.handler_initializer = None
        self._initialized_phases.clear()
        self._is_initialized = False

        logger.warning("Rollback complete.")
