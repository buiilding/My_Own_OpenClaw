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

from backend.src.api.routes import websocket
from backend.src.core.bootstrap import Bootstrap
from backend.src.core.shutdown import Shutdown

# Configure logging
logging.basicConfig(
    level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Disable noisy debug logs from specific libraries
logging.getLogger("litellm").setLevel(logging.WARNING)
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

# Disable system prompt content logging
logging.getLogger("backend.src.llm.prompt_constructor").setLevel(logging.INFO)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    bootstrap = Bootstrap()
    _, session_manager, plugin_registry = await bootstrap.startup(app)

    # Start background tasks
    task = asyncio.create_task(session_manager.run_summarization_periodically())

    yield

    # Shutdown
    shutdown = Shutdown()
    await shutdown.shutdown(plugin_registry, task)


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

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.src.main:app", host="0.0.0.0", port=8765, reload=True)
