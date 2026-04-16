"""Entrypoint for the standalone embedding service."""

from __future__ import annotations

import os

from backend.src.core.bootstrap.entrypoint import run_uvicorn_app


if __name__ == "__main__":
    run_uvicorn_app(
        "backend.src.embeddings.service_app:app",
        host=os.getenv("WINDIE_EMBEDDING_SERVICE_HOST", "0.0.0.0"),
        port=int(os.getenv("WINDIE_EMBEDDING_SERVICE_PORT", "8771")),
        reload=False,
    )
