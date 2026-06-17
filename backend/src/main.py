"""
Main Application Entry Point.

This module initializes the FastAPI application, sets up dependency injection,
configures CORS, and manages the application lifecycle including startup and shutdown.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.src.api.app_assembly import create_api_app
from backend.src.api.auth.http_middleware import install_auth_http_middleware
from backend.src.api.auth.service import InstallAuthService
from backend.src.api.deps import set_container
from backend.src.core.bootstrap.coordinator import InitializationCoordinator
from backend.src.core.bootstrap.entrypoint import (
    initialize_entrypoint_logger,
    run_uvicorn_app,
)

logger = initialize_entrypoint_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    coordinator = InitializationCoordinator()
    container, _session_manager = await coordinator.initialize()
    set_container(container, app=app, force=True)
    app.state.install_auth_service = InstallAuthService.from_config(container.config)

    try:
        yield
    finally:
        # Shutdown
        logger.info("Shutting down...")
        if hasattr(app.state, "install_auth_service"):
            delattr(app.state, "install_auth_service")
        set_container(None, app=app, force=True)
        logger.info("Shutdown complete.")


app = create_api_app(
    title="WindieOS",
    lifespan=lifespan,
)
app.middleware("http")(install_auth_http_middleware)

if __name__ == "__main__":
    run_uvicorn_app(
        "backend.src.main:app",
        reload=False,
    )
