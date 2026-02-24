"""
Simulation Backend Entry Point (Browser Control).

Uses MockLLMBrowserClient to drive browser tool calls.
Run with: python -m backend.src.simulation.browser
"""

from __future__ import annotations

from backend.src.api.app_assembly import create_api_app
from backend.src.core.bootstrap.entrypoint import (
    initialize_entrypoint_logger,
    is_verbose_access_log,
)
from backend.src.simulation.lifespan_factory import build_simulation_lifespan
from backend.src.simulation.mock_llm_browser_client import get_mock_llm_browser_client

logger = initialize_entrypoint_logger(__name__)

lifespan = build_simulation_lifespan(
    logger=logger,
    client_factory=get_mock_llm_browser_client,
    client_name="MockLLMBrowserClient",
    startup_message="Initializing browser simulation backend (using MockLLMBrowserClient)...",
    shutdown_message="Shutting down browser simulation backend...",
)


app = create_api_app(
    title="Desktop Assistant (Browser Simulation)",
    lifespan=lifespan,
)


def run() -> None:
    import uvicorn

    access_log = is_verbose_access_log()
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
