"""Shared app factory for simulation entrypoints."""

from __future__ import annotations

from collections.abc import Callable
from logging import Logger
from typing import Any

from fastapi import FastAPI

from backend.src.api.app_assembly import create_api_app
from backend.src.simulation.lifespan_factory import build_simulation_lifespan


def create_simulation_app(
    *,
    logger: Logger,
    client_factory: Callable[[], Any],
    client_name: str,
    startup_message: str,
    shutdown_message: str,
    title: str,
) -> FastAPI:
    """Build a simulation API app with the common simulation lifespan wiring."""
    lifespan = build_simulation_lifespan(
        logger=logger,
        client_factory=client_factory,
        client_name=client_name,
        startup_message=startup_message,
        shutdown_message=shutdown_message,
    )
    return create_api_app(
        title=title,
        lifespan=lifespan,
    )
