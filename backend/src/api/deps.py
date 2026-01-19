"""
FastAPI dependencies for dependency injection.

Provides app-lifespan-scoped container access via FastAPI dependency injection.
The container is set once during application startup and remains valid for the
entire application lifetime.
"""
import logging
import threading
from typing import Annotated
from fastapi import Depends, HTTPException

from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.core.base import MessageHandlerRegistry
from backend.src.core.container import Container

logger = logging.getLogger(__name__)

# App-lifespan-scoped container instance (set once during startup)
# Thread-safe initialization lock ensures visibility guarantees
_container: Container | None = None
_container_lock = threading.Lock()
_container_initialized = False


def set_container(container: Container, force: bool = False) -> None:
    """
    Set the app-lifespan-scoped container instance.
    
    Called once during application startup. The container remains valid for the
    entire application lifetime and is shared across all requests.
    
    Thread-safe: Uses lock to ensure visibility guarantees and prevent race conditions
    during initialization (though initialization should happen single-threaded at startup).
    
    Args:
        container: Application container instance
        force: If True, allow override of existing container (for testing/simulation).
               If False, raises RuntimeError if container is already set.
        
    Raises:
        RuntimeError: If container is already set and force=False
    """
    global _container, _container_initialized
    
    with _container_lock:
        if _container is not None and not force:
            raise RuntimeError(
                "Container already set. This should only happen once at startup. "
                "Use force=True only for testing/simulation scenarios."
            )
        if _container is not None and force:
            logger.warning("Container override forced - this should only happen in testing/simulation")
        
        _container = container
        _container_initialized = True
        logger.debug("Container set for app-lifespan scope")


async def get_container() -> Container:
    """
    Get the application container (app-lifespan-scoped).
    
    The container is initialized once at startup and remains valid for the
    entire application lifetime. This is not request-scoped - all requests
    share the same container instance.
    
    CRITICAL FIX #3: Removed blocking threading.Lock from async function.
    Variable assignment/reading of _container is atomic in Python (CPython GIL).
    For a read-mostly singleton initialized at startup, a lock in the getter
    blocks the entire asyncio event loop, creating latency spikes.
    
    Returns:
        Container instance
        
    Raises:
        HTTPException: If container is not initialized (503 Service Unavailable)
    """
    # CRITICAL FIX #3: Removed blocking lock - variable reads are atomic in Python
    # The container is set once at startup (single-threaded), so race conditions
    # are not possible during normal operation. Even if a race occurred, the worst
    # case is returning None (caught below) or the old container (acceptable during
    # the brief initialization window).
    if _container is None:
        logger.error("Container accessed before initialization - application not ready")
        raise HTTPException(
            status_code=503,
            detail="Application not initialized. Container not available."
        )
    return _container


async def get_session_manager(container: Container = Depends(get_container)) -> SessionManager:
    """
    Get the session manager from the container.
    
    Args:
        container: Application container (injected)
        
    Returns:
        SessionManager instance
        
    Raises:
        HTTPException: If session manager is not available
    """
    return container.session_manager


async def get_handler_registry(container: Container = Depends(get_container)) -> MessageHandlerRegistry:
    """
    Get the message handler registry from the container.
    
    Args:
        container: Application container (injected)
    
    Returns:
        MessageHandlerRegistry instance
    
    Raises:
        HTTPException: If handler registry is not available
    """
    return container.handler_registry


# Type aliases for FastAPI dependencies
ContainerDep = Annotated[Container, Depends(get_container)]
SessionManagerDep = Annotated[SessionManager, Depends(get_session_manager)]
HandlerRegistryDep = Annotated[MessageHandlerRegistry, Depends(get_handler_registry)]
