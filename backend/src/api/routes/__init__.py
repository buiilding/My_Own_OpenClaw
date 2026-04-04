"""Canonical API router registration surface."""

from __future__ import annotations

from fastapi import APIRouter

from . import artifacts, runs, sdk, websocket
from .memory import embeddings, semantic

API_ROUTERS: tuple[APIRouter, ...] = (
    websocket.router,
    runs.router,
    artifacts.router,
    sdk.router,
    embeddings.router,
    semantic.router,
)

__all__ = ["API_ROUTERS"]
