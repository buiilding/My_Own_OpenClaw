"""
Simulation Backend Main Entry Point.

This is EXACTLY like the main backend, but intercepts LLM calls and returns
hardcoded responses based on simulation steps. All other features work identically.
"""
from backend.src.core.bootstrap.entrypoint import (
    initialize_entrypoint_logger,
)
from backend.src.simulation.app_factory import create_simulation_app, run_simulation_app
from backend.src.simulation.mock_llm_client import get_mock_llm_client

logger = initialize_entrypoint_logger(__name__)


app = create_simulation_app(
    logger=logger,
    client_factory=get_mock_llm_client,
    client_name="MockLLMClient",
    startup_message="Initializing simulation backend (using MockLLMClient)...",
    shutdown_message="Shutting down simulation backend...",
    title="Desktop Assistant (Simulation)",
)

if __name__ == "__main__":
    run_simulation_app("backend.src.simulation.main:app")
