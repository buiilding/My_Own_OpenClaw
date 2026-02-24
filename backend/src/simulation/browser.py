"""
Simulation Backend Entry Point (Browser Control).

Uses MockLLMBrowserClient to drive browser tool calls.
Run with: python -m backend.src.simulation.browser
"""

from __future__ import annotations

from backend.src.api.app_assembly import create_api_app
from backend.src.core.bootstrap.entrypoint import (
    initialize_entrypoint_logger,
    run_uvicorn_app,
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
    run_uvicorn_app(
        "backend.src.simulation.browser:app",
        reload=True,
        reload_dirs=["backend/src"],
    )


if __name__ == "__main__":
    run()
