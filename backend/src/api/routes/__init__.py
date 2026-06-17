"""Canonical API router registration surface."""

from __future__ import annotations

from fastapi import APIRouter

from backend.src.api.auth.router import router as auth_router

from . import artifacts, runs, sdk, transcription, websocket
from .memory import embeddings, semantic

API_ROUTERS: tuple[APIRouter, ...] = (
    auth_router,
    websocket.router,
    transcription.router,
    runs.router,
    artifacts.router,
    sdk.router,
    embeddings.router,
    semantic.router,
)

__all__ = ["API_ROUTERS"]
