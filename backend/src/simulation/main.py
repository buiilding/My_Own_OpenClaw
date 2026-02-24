"""
Simulation Backend Main Entry Point.

This is EXACTLY like the main backend, but intercepts LLM calls and returns
hardcoded responses based on simulation steps. All other features work identically.
"""
from backend.src.api.app_assembly import create_api_app
from backend.src.core.bootstrap.entrypoint import (
    initialize_entrypoint_logger,
    is_verbose_access_log,
)
from backend.src.simulation.lifespan_factory import build_simulation_lifespan
from backend.src.simulation.mock_llm_client import get_mock_llm_client

logger = initialize_entrypoint_logger(__name__)


lifespan = build_simulation_lifespan(
    logger=logger,
    client_factory=get_mock_llm_client,
    client_name="MockLLMClient",
    startup_message="Initializing simulation backend (using MockLLMClient)...",
    shutdown_message="Shutting down simulation backend...",
)


app = create_api_app(
    title="Desktop Assistant (Simulation)",
    lifespan=lifespan,
)

if __name__ == "__main__":
    import uvicorn
    access_log = is_verbose_access_log()

    uvicorn.run(
        "backend.src.simulation.main:app",
        host="0.0.0.0",
        port=8765,  # Same port as main backend
        access_log=access_log,
        reload=True,
        reload_dirs=["backend/src"]
    )
