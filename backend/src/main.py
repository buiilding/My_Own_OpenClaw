import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.api.routes import websocket
from backend.src.api.deps import _app_state
from backend.src.core.container import Container
from backend.src.brain.session_manager import SessionManager
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing application container...")
    container = Container()
    await container.initialize()
    
    session_manager = SessionManager(container)
    
    # Set global state
    _app_state.container = container
    _app_state.session_manager = session_manager
    
    # Start background tasks
    task = asyncio.create_task(session_manager.run_summarization_periodically())
    
    logger.info("Application initialized.")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    task.cancel()

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

