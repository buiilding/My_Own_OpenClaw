"""
FastAPI dependencies for dependency injection.
Uses dependency-injector for proper DI instead of global state.
"""
from typing import Annotated
from fastapi import Depends, HTTPException

from backend.src.core.container import Container
from backend.src.agent.session_manager import SessionManager


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
    # Session manager is created during startup and stored in container
    # For now, we'll create it on-demand if needed
    # In the future, this should be provided by the DI container
    if not hasattr(container, '_session_manager'):
        container._session_manager = SessionManager(container)
    return container._session_manager


# Type aliases for FastAPI dependencies
ContainerDep = Annotated[Container, Depends(get_container)]
SessionManagerDep = Annotated[SessionManager, Depends(get_session_manager)]
