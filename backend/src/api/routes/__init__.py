"""Canonical API router registration surface."""

from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.auth.router import router as auth_router

from . import sdk, websocket
from .artifacts.router import router as artifacts_router
from .memory import embeddings, semantic
from .runs.router import router as runs_router
from .transcription.router import router as transcription_router

API_ROUTERS: tuple[APIRouter, ...] = (
    auth_router,
    websocket.router,
    transcription_router,
    runs_router,
    artifacts_router,
    sdk.router,
    embeddings.router,
    semantic.router,
)

__all__ = ["API_ROUTERS"]
