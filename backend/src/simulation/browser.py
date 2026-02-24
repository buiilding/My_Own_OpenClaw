"""
Simulation Backend Entry Point (Browser Control).

Uses MockLLMBrowserClient to drive browser tool calls.
Run with: python -m backend.src.simulation.browser
"""

from __future__ import annotations

from backend.src.core.bootstrap.entrypoint import (
    initialize_entrypoint_logger,
)
from backend.src.simulation.app_factory import create_simulation_app, run_simulation_app
from backend.src.simulation.mock_llm_browser_client import get_mock_llm_browser_client

logger = initialize_entrypoint_logger(__name__)

app = create_simulation_app(
    logger=logger,
    client_factory=get_mock_llm_browser_client,
    client_name="MockLLMBrowserClient",
    startup_message="Initializing browser simulation backend (using MockLLMBrowserClient)...",
    shutdown_message="Shutting down browser simulation backend...",
    title="Desktop Assistant (Browser Simulation)",
)


def run() -> None:
    run_simulation_app("backend.src.simulation.browser:app")


if __name__ == "__main__":
    run()
