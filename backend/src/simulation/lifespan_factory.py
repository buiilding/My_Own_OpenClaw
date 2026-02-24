"""Shared lifecycle wiring for simulation backend entrypoints."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI

from backend.src.api.deps import set_container
from backend.src.core.config import AppConfig
from backend.src.llm.client import LLMClient


def build_simulation_lifespan(
    *,
    logger: logging.Logger,
    client_factory: Callable[[AppConfig], LLMClient],
    client_name: str,
    startup_message: str,
    shutdown_message: str,
):
    """Create a FastAPI lifespan manager that overrides the LLM client provider."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(startup_message)

        from dependency_injector import providers
        from backend.src.core.bootstrap.coordinator import InitializationCoordinator

        class SimulationInitializationCoordinator(InitializationCoordinator):
            """Initialization coordinator for simulation mode."""

            async def _initialize_container(self) -> None:
                logger.info("Phase 2: Initializing container (simulation mode)...")
                from backend.src.core.container.facade import Container

                self.container = Container()
                await self.container.initialize()
                logger.info("Container initialized (simulation mode).")

        coordinator = SimulationInitializationCoordinator()
        container, _session_manager = await coordinator.initialize(app)
        set_container(container, app=app, force=True)

        try:
            def mock_llm_client_factory(session_config=None):
                cfg = (
                    session_config
                    if session_config is not None
                    else container._di_container.core.config()
                )
                return client_factory(cfg)

            container._di_container.core.llm_client.override(
                providers.Factory(mock_llm_client_factory)
            )
            container._mock_llm_factory = mock_llm_client_factory
            container.invalidate_session_factory()
            logger.info("LLM client factory overridden to use %s", client_name)
            logger.info(
                "Session factory reset - will use %s on next session creation",
                client_name,
            )
            logger.info("Simulation backend initialized successfully")
            logger.info("Waiting for WebSocket connections on ws://0.0.0.0:8765/ws")

            yield
        finally:
            logger.info(shutdown_message)
            set_container(None, app=app, force=True)
            logger.info("Shutdown complete.")

    return lifespan

