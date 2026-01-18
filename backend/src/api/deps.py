"""
FastAPI dependencies for dependency injection.
Uses dependency-injector for proper DI instead of global state.
"""
from typing import Annotated
from fastapi import Depends, HTTPException

from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.handlers.base import MessageHandlerRegistry
from backend.src.core.container import Container


# Global container instance (set during app startup)
_container: Container | None = None


def set_container(container: Container) -> None:
    """Set the global container instance (called during app startup)."""
    global _container
    _container = container


async def get_container() -> Container:
    """
    Get the application container.
    
    Returns:
        Container instance
        
    Raises:
        HTTPException: If container is not initialized
    """
    if _container is None:
        raise HTTPException(status_code=503, detail="Application not initialized")
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
