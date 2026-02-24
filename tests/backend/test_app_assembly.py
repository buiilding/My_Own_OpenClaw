from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.api.app_assembly import DEFAULT_ALLOWED_ORIGINS, create_api_app


@asynccontextmanager
async def _test_lifespan(_app: FastAPI):
    yield


def test_create_api_app_registers_shared_routes():
    app = create_api_app(title="Test App", lifespan=_test_lifespan)
    registered_paths = {route.path for route in app.routes}

    assert "/ws" in registered_paths
    assert "/api/artifacts/" in registered_paths
    assert "/api/artifacts/{artifact_id}" in registered_paths
    assert "/api/embeddings/" in registered_paths
    assert "/api/semantic/summarize" in registered_paths


def test_create_api_app_applies_default_cors_policy():
    app = create_api_app(title="CORS App", lifespan=_test_lifespan)
    cors_middleware = [
        middleware for middleware in app.user_middleware
        if middleware.cls is CORSMiddleware
    ]

    assert len(cors_middleware) == 1
    assert cors_middleware[0].kwargs["allow_origins"] == list(DEFAULT_ALLOWED_ORIGINS)


def test_create_api_app_allows_cors_override():
    app = create_api_app(
        title="CORS Override App",
        lifespan=_test_lifespan,
        allow_origins=["https://example.com"],
    )
    cors_middleware = [
        middleware for middleware in app.user_middleware
        if middleware.cls is CORSMiddleware
    ]

    assert len(cors_middleware) == 1
    assert cors_middleware[0].kwargs["allow_origins"] == ["https://example.com"]

