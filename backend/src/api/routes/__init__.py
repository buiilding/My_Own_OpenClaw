"""Canonical API router registration surface."""

from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.auth.router import router as auth_router

from .artifacts.router import router as artifacts_router
from .memory.embeddings.router import router as embeddings_router
from .memory.semantic.router import router as semantic_router
from .runs.router import router as runs_router
from .sdk.router import router as sdk_router
from .transcription.router import router as transcription_router
from .websocket.router import router as websocket_router

API_ROUTERS: tuple[APIRouter, ...] = (
    auth_router,
    websocket_router,
    transcription_router,
    runs_router,
    artifacts_router,
    sdk_router,
    embeddings_router,
    semantic_router,
)

__all__ = ["API_ROUTERS"]
