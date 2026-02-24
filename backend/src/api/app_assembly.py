"""Shared FastAPI app assembly for backend runtime entrypoints."""

from __future__ import annotations

from collections.abc import Sequence
from contextlib import AbstractAsyncContextManager
from typing import Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.api.routes import API_ROUTERS

LifespanHandler = Callable[[FastAPI], AbstractAsyncContextManager[None]]
DEFAULT_ALLOWED_ORIGINS = ("http://localhost:5173",)


def register_api_routes(app: FastAPI) -> None:
    """Attach all public API routers to the provided app."""
    for router in API_ROUTERS:
        app.include_router(router)


def configure_default_cors(
    app: FastAPI,
    allow_origins: Sequence[str] | None = None,
) -> None:
    """Apply the default CORS policy used by backend and simulation apps."""
    origins = list(allow_origins) if allow_origins is not None else list(DEFAULT_ALLOWED_ORIGINS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def create_api_app(
    *,
    title: str,
    lifespan: LifespanHandler,
    allow_origins: Sequence[str] | None = None,
) -> FastAPI:
    """Create a FastAPI app with shared middleware and route registration."""
    app = FastAPI(title=title, lifespan=lifespan)
    configure_default_cors(app, allow_origins=allow_origins)
    register_api_routes(app)
    return app
