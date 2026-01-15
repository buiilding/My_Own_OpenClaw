"""
Simulation Backend Main Entry Point.

This is EXACTLY like the main backend, but intercepts LLM calls and returns
hardcoded responses based on simulation steps. All other features work identically.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.api.routes import websocket, embeddings, semantic
from backend.src.core.bootstrap.coordinator import InitializationCoordinator
from backend.src.core.container.core_container import CoreContainer
from backend.src.simulation.mock_llm_client import get_mock_llm_client

# Configure logging
logging.basicConfig(
    level=logging.DEBUG, format="%(name)s - %(levelname)s - %(message)s"
)

# Disable noisy debug logs from specific libraries
logging.getLogger("litellm").setLevel(logging.WARNING)
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("aiosqlite").setLevel(logging.WARNING)
logging.getLogger("PIL").setLevel(logging.WARNING)
logging.getLogger("PIL.PngImagePlugin").setLevel(logging.WARNING)
logging.getLogger("Pillow").setLevel(logging.WARNING)

# Disable system prompt content logging
logging.getLogger("backend.src.llm.prompt_constructor").setLevel(logging.INFO)

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
    
    # SIMULATION: Override vision service to None before initialization to save memory
    # This prevents the vision model from being loaded at startup
    # Vision service will be lazy-loaded only if actually needed (which it won't be in simulation)
    from dependency_injector import providers
    
    # Create a custom coordinator that skips vision initialization
    from backend.src.core.bootstrap.coordinator import InitializationCoordinator
    from backend.src.core.container.initializer import ContainerInitializer
    
    class SimulationContainerInitializer(ContainerInitializer):
        """Container initializer that skips vision service initialization for simulation."""
        
        async def _initialize_vision_service(self) -> None:
            """Skip vision service initialization in simulation to save memory."""
            logger.info("Skipping vision service initialization in simulation mode (lazy-load only)")
            # Don't initialize vision service - it will be lazy-loaded if needed
            # Don't set it in context factory - tools will handle None gracefully
    
    class SimulationInitializationCoordinator(InitializationCoordinator):
        """Initialization coordinator that uses simulation container initializer."""
        
        async def _initialize_container(self) -> None:
            """Initialize container with simulation initializer."""
            logger.info("Phase 2: Initializing container (simulation mode)...")
            
            from backend.src.core.container.container import Container
            from backend.src.api.deps import set_container
            
            self.container = Container()
            
            # Override vision service provider to return None (saves memory)
            self.container._di_container.core.vision_service.override(
                providers.Object(None)
            )
            logger.info("Vision service provider overridden to None (simulation mode)")
            
            # Replace initializer with simulation version before initialization
            self.container._initializer = SimulationContainerInitializer(self.container)
            
            await self.container.initialize()
            
            # Set container in DI system
            set_container(self.container)
            logger.info("Container initialized (simulation mode).")
    
    coordinator = SimulationInitializationCoordinator()
    container, session_manager, plugin_registry = await coordinator.initialize(app)
    
    # CRITICAL: Override LLM client factory to use MockLLMClient
    # This intercepts all LLM calls and returns hardcoded responses
    # Override the provider in the DI container
    container._di_container.core.llm_client.override(
        providers.Factory(
            lambda cfg: get_mock_llm_client(cfg),
            cfg=container._di_container.core.config,
        )
    )
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
    await plugin_registry.shutdown_all_plugins()
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

    uvicorn.run(
        "backend.src.simulation.main:app",
        host="0.0.0.0",
        port=8765,  # Same port as main backend
        reload=True,
        reload_dirs=["backend/src"]
    )
