"""
Initialization Coordinator.

Coordinates the initialization phases of the application startup process.
"""

import logging
import threading
from typing import List, Optional, Tuple

from backend.src.agent.session.manager import SessionManager
from backend.src.core.bootstrap.handler_initializer import HandlerInitializer
from backend.src.core.config.manager import ConfigManager, get_config_manager
from backend.src.core.container.facade import Container

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
    4. Final validation

    Provides error handling and rollback on failure.
    Thread-safe: Prevents multiple concurrent initializations.
    """

    def __init__(self):
        """Initialize the coordinator."""
        self.config_manager: Optional[ConfigManager] = None
        self.container: Optional[Container] = None
        self.session_manager: Optional[SessionManager] = None
        self.handler_initializer: Optional[HandlerInitializer] = None
        self._initialized_phases: List[str] = []
        self._is_initialized: bool = False
        self._is_initializing: bool = False
        self._state_lock = threading.Lock()

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
        config_manager: Optional[ConfigManager] = None,
    ) -> Tuple[Container, SessionManager]:
        """
        Initialize all application components in phases.

        Args:
            config_manager: Optional ConfigManager instance. If None, uses global singleton.

        Returns:
            Tuple of (container, session_manager)

        Raises:
            InitializationError: If any phase fails during initialization.
            RuntimeError: If already initialized (caller should check is_initialized first).
        """
        with self._state_lock:
            if self._is_initialized:
                raise RuntimeError(
                    "InitializationCoordinator already initialized. "
                    "Check is_initialized property before calling initialize()."
                )
            if self._is_initializing:
                raise RuntimeError(
                    "InitializationCoordinator initialization already in progress. "
                    "Wait for the active initialize() call to complete before retrying."
                )
            self._is_initializing = True

        current_phase = "unknown"

        try:
            # Phase 1: Configuration
            current_phase = "configuration"
            await self._initialize_configuration(config_manager)
            self._initialized_phases.append("configuration")

            # Phase 2: Container
            current_phase = "container"
            await self._initialize_container()
            self._initialized_phases.append("container")

            # Phase 3: Services (SessionManager, Handlers)
            current_phase = "services"
            await self._initialize_services()
            self._initialized_phases.append("services")

            # Validate final state
            current_phase = "validation"
            self._validate_final_state()

            with self._state_lock:
                self._is_initialized = True
            logger.info("Application initialization complete.")
            return self.container, self.session_manager

        except Exception as e:
            # Preserve original exception type if it's already an InitializationError
            if isinstance(e, InitializationError):
                original_error = e
            else:
                original_error = InitializationError(
                    f"Initialization failed at phase '{current_phase}': {str(e)}"
                )

            logger.error(
                "Initialization failed at phase: %s",
                current_phase,
                exc_info=True,
            )
            # Attempt cleanup of initialized phases
            await self._rollback()
            raise original_error
        finally:
            with self._state_lock:
                self._is_initializing = False

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
        from backend.src.llm.prompts.prompts import PromptManager

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
        # Validate container has required services
        if self.container.config_service is None:
            raise InitializationError(
                "Container.config_service is None after initialization"
            )
        if self.container.tool_registry is None:
            raise InitializationError(
                "Container.tool_registry is None after initialization"
            )

        logger.debug("Final state validation passed")

    async def _rollback(self) -> None:
        """
        Rollback initialized phases in reverse order.

        Attempts to clean up any partially initialized state, including:
        - Unsubscribing from config changes
        - Resetting all coordinator state
        """
        logger.warning("Rolling back initialization...")

        # Rollback in reverse order
        for phase in reversed(self._initialized_phases):
            try:
                if phase == "services":
                    # Unsubscribe SessionManager from config changes
                    if self.session_manager is not None and self.container is not None:
                        try:
                            config_service = self.container.config_service
                            if config_service is not None:
                                config_service.unsubscribe(self.session_manager)
                                logger.debug(
                                    "Unsubscribed SessionManager from config changes"
                                )
                        except Exception as e:
                            logger.warning(
                                f"Error unsubscribing SessionManager during rollback: {e}"
                            )
                    logger.debug("Rolled back services phase")

                elif phase == "container":
                    logger.debug("Rolled back container phase")

                elif phase == "configuration":
                    # Configuration cleanup (usually stateless, but log for completeness)
                    logger.debug("Rolled back configuration phase")
            except Exception as e:
                logger.error(
                    f"Error during rollback of {phase} phase: {e}", exc_info=True
                )

        # Reset all state
        self.config_manager = None
        self.container = None
        self.session_manager = None
        self.handler_initializer = None
        self._initialized_phases.clear()
        self._is_initialized = False

        logger.warning("Rollback complete.")
