"""
Main Application Entry Point.

This module initializes the FastAPI application, sets up dependency injection,
configures CORS, and manages the application lifecycle including startup and shutdown.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import asyncio

from backend.src.api.routes import websocket
from backend.src.api.deps import set_container
from backend.src.core.container import Container
from backend.src.agent.session_manager import SessionManager

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Disable noisy debug logs from specific libraries
logging.getLogger('litellm').setLevel(logging.WARNING)
logging.getLogger('LiteLLM').setLevel(logging.WARNING)
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('urllib3').setLevel(logging.WARNING)

# Disable system prompt content logging
logging.getLogger('backend.src.llm.prompt_constructor').setLevel(logging.INFO)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing application container...")
    
    # Load configuration first (via ConfigManager)
    from backend.src.core.config import get_config_manager
    config_manager = get_config_manager()
    # Config will be loaded by ConfigService or Container, no need to load explicitly here
    
    # Initialize ConfigurationService
    from backend.src.core.config_service import initialize_config_service
    config_service = initialize_config_service(config_manager)
    logger.info("ConfigurationService initialized.")
    
    # Initialize container (which uses the loaded config)
    container = Container()
    await container.initialize()
    
    # Set container in DI system
    set_container(container)
    
    # Create session manager
    session_manager = SessionManager(container)
    # Store in container for access via DI
    container._session_manager = session_manager
    
    # Subscribe SessionManager to config changes
    config_service.subscribe(session_manager)
    logger.info("SessionManager subscribed to config changes.")
    
    # Initialize WebSocket message handlers
    from backend.src.api.handlers import initialize_handlers
    initialize_handlers(session_manager)
    logger.info("WebSocket message handlers initialized.")
    
    # Initialize Enhanced Plugin Registry
    from backend.src.core.plugins import initialize_enhanced_plugin_registry
    
    # Define plugin directories to scan
    # Includes built-in plugins and external 'plugins' directory
    project_root = Path(__file__).parent.parent.parent
    builtin_plugins_dir = Path(__file__).parent / "agent" / "plugins"
    external_plugins_dir = project_root / "plugins"
    
    plugin_dirs = [builtin_plugins_dir, external_plugins_dir]
    
    # Initialize registry without auto-discovery to allow manual container injection first
    enhanced_registry = initialize_enhanced_plugin_registry(
        plugin_dirs=plugin_dirs,
        auto_discover=False
    )
    
    # Inject container into registry for plugin dependencies
    enhanced_registry.set_container(container)
    
    # Discover and register plugins
    await enhanced_registry.discover_and_register(auto_enable=True)
    logger.info(f"Registered {len(enhanced_registry.get_enabled_plugins())} plugins")
    
    # Initialize all enabled plugins
    await enhanced_registry.initialize_all_plugins()
    logger.info("Enhanced plugin registry initialized.")
    
    # Start background tasks
    task = asyncio.create_task(session_manager.run_summarization_periodically())
    
    logger.info("Application initialized.")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    
    # Shutdown plugins
    await enhanced_registry.shutdown_all_plugins()
    
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
