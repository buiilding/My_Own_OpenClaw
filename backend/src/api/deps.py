"""
FastAPI dependencies for dependency injection.

Provides app-lifespan-scoped container access via FastAPI dependency injection.
The container lives on ``app.state.container`` for the FastAPI app lifecycle.
"""
import logging
from typing import Annotated
from fastapi import Depends, HTTPException, Request, WebSocket, FastAPI

from backend.src.agent.session.manager import SessionManager
from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.core.container import Container

logger = logging.getLogger(__name__)

def set_container(
    container: Container | None,
    *,
    app: FastAPI | None = None,
    force: bool = False,
) -> None:
    """
    Set or clear app-lifespan-scoped container on ``app.state``.

    Args:
        container: Application container instance, or ``None`` to clear.
        app: FastAPI app whose lifespan owns the container.
        force: If True, allow overriding an existing container.

    Raises:
        RuntimeError: If container already exists and force=False.
    """
    if app is None:
        logger.debug("set_container called without app; ignoring legacy global path")
        return

    existing_container = getattr(app.state, "container", None)
    if existing_container is not None and container is not existing_container and not force:
        raise RuntimeError(
            "Container already set on app.state. "
            "Use force=True only for controlled replacement."
        )

    if container is None:
        if hasattr(app.state, "container"):
            delattr(app.state, "container")
        logger.debug("Container cleared from app.state")
        return

    app.state.container = container
    logger.debug("Container set on app.state")


def _resolve_app(
    request: Request | None,
    websocket: WebSocket | None,
) -> FastAPI | None:
    """Resolve FastAPI app from request or websocket context."""
    if request is not None:
        return request.app
    if websocket is not None:
        return websocket.app
    return None


async def get_container(
    request: Request = None,
    websocket: WebSocket = None,
) -> Container:
    """
    Get the application container from ``app.state``.

    Returns:
        Container instance

    Raises:
        HTTPException: If app context or container is not available.
    """
    app = _resolve_app(request, websocket)
    if app is None:
        logger.error("Container dependency resolved without request/websocket context")
        raise HTTPException(
            status_code=500,
            detail="Container dependency requires request or websocket context.",
        )

    container = getattr(app.state, "container", None)
    if container is None:
        logger.error("Container accessed before initialization - app.state.container missing")
        raise HTTPException(
            status_code=503,
            detail="Application not initialized. Container not available.",
        )
    return container


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
