"""Canonical API router registration surface."""

from __future__ import annotations

from fastapi import APIRouter

from backend.src.api import auth

from . import artifacts, runs, sdk, transcription, websocket
from .memory import embeddings, semantic

API_ROUTERS: tuple[APIRouter, ...] = (
    auth.router,
    websocket.router,
    transcription.router,
    runs.router,
    artifacts.router,
    sdk.router,
    embeddings.router,
    semantic.router,
)

__all__ = ["API_ROUTERS"]
