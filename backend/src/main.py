"""
Main Application Entry Point.

This module initializes the FastAPI application, sets up dependency injection,
configures CORS, and manages the application lifecycle including startup and shutdown.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.api.routes import websocket, embeddings, semantic
from backend.src.core.bootstrap.coordinator import InitializationCoordinator

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
    # Startup
    coordinator = InitializationCoordinator()
    _, session_manager, plugin_registry = await coordinator.initialize(app)

    yield

    # Shutdown
    logger.info("Shutting down...")
    await plugin_registry.shutdown_all_plugins()
    logger.info("Shutdown complete.")


app = FastAPI(title="Desktop Assistant", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(websocket.router)
app.include_router(embeddings.router)
app.include_router(semantic.router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.src.main:app",
        host="0.0.0.0",
        port=8765,
        reload=True,
        reload_dirs=["backend/src"]
    )
