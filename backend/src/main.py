"""
Main Application Entry Point.

This module initializes the FastAPI application, sets up dependency injection,
configures CORS, and manages the application lifecycle including startup and shutdown.
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.src.api.app_assembly import create_api_app
from backend.src.api.deps import set_container
from backend.src.core.bootstrap.coordinator import InitializationCoordinator
from backend.src.core.logging_setup import configure_logging

configure_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    coordinator = InitializationCoordinator()
    container, _session_manager = await coordinator.initialize(app)
    set_container(container, app=app, force=True)

    try:
        yield
    finally:
        # Shutdown
        logger.info("Shutting down...")
        set_container(None, app=app, force=True)
        logger.info("Shutdown complete.")


app = create_api_app(
    title="Desktop Assistant",
    lifespan=lifespan,
)

if __name__ == "__main__":
    import uvicorn
    access_log = os.getenv("WINDIEOS_LOG_PROFILE", "important").lower() == "verbose"

    uvicorn.run(
        "backend.src.main:app",
        host="0.0.0.0",
        port=8765,
        access_log=access_log,
        reload=False,
    )
