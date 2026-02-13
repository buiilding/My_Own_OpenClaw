"""
Simulation Backend Entry Point (Browser Control).

Uses MockLLMBrowserClient to drive browser_control tool calls.
Run with: python -m backend.src.simulation.browser
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.api.deps import set_container
from backend.src.api.routes import websocket
from backend.src.api.routes import artifacts
from backend.src.api.routes.memory import embeddings, semantic
from backend.src.core.logging_setup import configure_logging
from backend.src.simulation.mock_llm_browser_client import get_mock_llm_browser_client

configure_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.

    Initializes all services using the same InitializationCoordinator as main backend,
    but overrides the LLM client factory to use MockLLMBrowserClient.
    """
    logger.info("Initializing browser simulation backend (using MockLLMBrowserClient)...")

    from dependency_injector import providers
    from backend.src.core.bootstrap.coordinator import InitializationCoordinator

    class SimulationInitializationCoordinator(InitializationCoordinator):
        """Initialization coordinator for simulation mode."""

        async def _initialize_container(self) -> None:
            """Initialize container for simulation mode."""
            logger.info("Phase 2: Initializing container (simulation mode)...")

            from backend.src.core.container.facade import Container

            self.container = Container()

            # Initialize container normally (including vision service)
            await self.container.initialize()

            logger.info("Container initialized (simulation mode).")

    coordinator = SimulationInitializationCoordinator()
    container, _session_manager = await coordinator.initialize(app)
    set_container(container, app=app, force=True)

    try:
        def mock_llm_client_factory(session_config=None):
            """Factory that always returns MockLLMBrowserClient, accepting optional session config."""
            cfg = session_config if session_config is not None else container._di_container.core.config()
            return get_mock_llm_browser_client(cfg)

        container._di_container.core.llm_client.override(
            providers.Factory(mock_llm_client_factory)
        )
        container._mock_llm_factory = mock_llm_client_factory
        container.invalidate_session_factory()
        logger.info("LLM client factory overridden to use MockLLMBrowserClient")
        logger.info("Session factory reset - will use MockLLMBrowserClient on next session creation")

        logger.info("Browser simulation backend initialized successfully")
        logger.info("Waiting for WebSocket connections on ws://0.0.0.0:8765/ws")

        yield
    finally:
        logger.info("Shutting down browser simulation backend...")
        set_container(None, app=app, force=True)
        logger.info("Shutdown complete.")


app = FastAPI(title="Desktop Assistant (Browser Simulation)", lifespan=lifespan)

# CORS (same as main backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes (same as main backend)
app.include_router(websocket.router)
app.include_router(artifacts.router)
app.include_router(embeddings.router)
app.include_router(semantic.router)


def run() -> None:
    import uvicorn

    access_log = os.getenv("WINDIEOS_LOG_PROFILE", "important").lower() == "verbose"
    uvicorn.run(
        "backend.src.simulation.browser:app",
        host="0.0.0.0",
        port=8765,
        access_log=access_log,
        reload=True,
        reload_dirs=["backend/src"],
    )


if __name__ == "__main__":
    run()
