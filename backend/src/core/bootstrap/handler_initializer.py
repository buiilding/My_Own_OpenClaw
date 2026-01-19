"""
Handler Initializer.

Handles WebSocket message handler initialization.
"""
import logging
from typing import Optional

from backend.src.core.container import Container

logger = logging.getLogger(__name__)


class HandlerInitializationError(Exception):
    """Raised when handler initialization fails."""
    pass


class HandlerInitializer:
    """
    Initializes WebSocket message handlers.

    Handlers are now managed by the DI container (ApiContainer),
    so this initializer ensures the handler registry is created and validated.
    """

    async def initialize(self, container: Optional[Container] = None) -> None:
        """
        Initialize handler registry from container.

        Args:
            container: Container instance with handler registry. Must not be None.

        Raises:
            HandlerInitializationError: If initialization fails or validation fails.
            ValueError: If container is None.
        """
        # Validate container parameter
        if container is None:
            raise ValueError("Container cannot be None for handler initialization")

        try:
            # Access handler registry to trigger lazy creation
            handler_registry = container.handler_registry

            # Validate handler registry was created
            if handler_registry is None:
                raise HandlerInitializationError(
                    "Handler registry is None after initialization"
                )

            # Verify handlers are registered
            registered_handlers = handler_registry.list_handlers()
            if not registered_handlers:
                raise HandlerInitializationError(
                    "No handlers registered in handler registry"
                )

            logger.info(
                f"WebSocket message handlers initialized via DI container. "
                f"Registered handlers: {', '.join(registered_handlers)}"
            )

        except AttributeError as e:
            raise HandlerInitializationError(
                f"Container does not have handler_registry property: {str(e)}"
            ) from e
        except Exception as e:
            raise HandlerInitializationError(
                f"Failed to initialize handler registry: {str(e)}"
            ) from e
