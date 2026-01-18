"""
FastAPI dependencies for dependency injection.

Provides app-lifespan-scoped container access via FastAPI dependency injection.
The container is set once during application startup and remains valid for the
entire application lifetime.
"""
import logging
from typing import Annotated
from fastapi import Depends, HTTPException

from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.handlers.base import MessageHandlerRegistry
from backend.src.core.container import Container

logger = logging.getLogger(__name__)

# App-lifespan-scoped container instance (set once during startup)
_container: Container | None = None


def set_container(container: Container) -> None:
    """
    Set the app-lifespan-scoped container instance.
    
    Called once during application startup. The container remains valid for the
    entire application lifetime and is shared across all requests.
    
    Args:
        container: Application container instance
        
    Raises:
        RuntimeError: If container is already set (prevents accidental re-initialization)
    """
    global _container
    if _container is not None:
        logger.warning("Container already set - this should only happen once at startup")
        # Allow override for testing, but log warning
    _container = container
    logger.debug("Container set for app-lifespan scope")


async def get_container() -> Container:
    """
    Get the application container (app-lifespan-scoped).
    
    The container is initialized once at startup and remains valid for the
    entire application lifetime. This is not request-scoped - all requests
    share the same container instance.
    
    Returns:
        Container instance
        
    Raises:
        HTTPException: If container is not initialized (503 Service Unavailable)
    """
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
