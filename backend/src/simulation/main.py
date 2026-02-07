"""
Simulation Backend Main Entry Point.

This is EXACTLY like the main backend, but intercepts LLM calls and returns
hardcoded responses based on simulation steps. All other features work identically.
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.api.routes import websocket
from backend.src.api.routes.memory import embeddings, semantic
from backend.src.core.bootstrap.coordinator import InitializationCoordinator
from backend.src.core.container.core_container import CoreContainer
from backend.src.core.logging_setup import configure_logging
from backend.src.simulation.mock_llm_client import get_mock_llm_client

configure_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    
    Initializes all services using the same InitializationCoordinator as main backend,
    but overrides the LLM client factory to use MockLLMClient instead.
    """
    # Startup: Initialize using the same coordinator as main backend
    logger.info("Initializing simulation backend (using MockLLMClient)...")
    
    from dependency_injector import providers
    from backend.src.core.bootstrap.coordinator import InitializationCoordinator
    
    class SimulationInitializationCoordinator(InitializationCoordinator):
        """Initialization coordinator for simulation mode."""
        
        async def _initialize_container(self) -> None:
            """Initialize container for simulation mode."""
            logger.info("Phase 2: Initializing container (simulation mode)...")
            
            from backend.src.core.container.facade import Container
            from backend.src.api.deps import set_container
            
            self.container = Container()
            
            # Initialize container normally (including vision service)
            await self.container.initialize()
            
            # Set container in DI system (force=True since parent class may have already set it)
            set_container(self.container, force=True)
            logger.info("Container initialized (simulation mode).")
    
    coordinator = SimulationInitializationCoordinator()
    container, session_manager = await coordinator.initialize(app)
    
    # CRITICAL: Override LLM client factory to use MockLLMClient
    # This intercepts all LLM calls and returns hardcoded responses
    # Override the provider in the DI container
    # Note: The factory accepts an optional config parameter for session-specific configs
    # but always uses MockLLMClient regardless of the config
    def mock_llm_client_factory(session_config=None):
        """Factory that always returns MockLLMClient, accepting optional session config."""
        # Use session config if provided, otherwise use global config
        cfg = session_config if session_config is not None else container._di_container.core.config()
        return get_mock_llm_client(cfg)
    
    container._di_container.core.llm_client.override(
        providers.Factory(mock_llm_client_factory)
    )
    # Store reference to mock factory so container can use it directly
    container._mock_llm_factory = mock_llm_client_factory
    logger.info("LLM client factory overridden to use MockLLMClient")
    
    # Reset session factory so it will be recreated with MockLLMClient on next session creation
    # This ensures all new sessions use the mock client
    container._session_factory = None
    logger.info("Session factory reset - will use MockLLMClient on next session creation")
    
    logger.info("Simulation backend initialized successfully")
    logger.info("Waiting for WebSocket connections on ws://0.0.0.0:8765/ws")
    
    yield
    
    # Shutdown
    logger.info("Shutting down simulation backend...")
    logger.info("Shutdown complete.")


app = FastAPI(title="Desktop Assistant (Simulation)", lifespan=lifespan)

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
app.include_router(embeddings.router)
app.include_router(semantic.router)

if __name__ == "__main__":
    import uvicorn
    access_log = os.getenv("WINDIEOS_LOG_PROFILE", "important").lower() == "verbose"

    uvicorn.run(
        "backend.src.simulation.main:app",
        host="0.0.0.0",
        port=8765,  # Same port as main backend
        access_log=access_log,
        reload=True,
        reload_dirs=["backend/src"]
    )
