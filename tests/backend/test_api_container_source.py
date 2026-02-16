from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException

from backend.src.api.deps import (
    _resolve_app,
    get_container,
    get_handler_registry,
    get_session_manager,
    set_container,
)


def test_api_container_uses_core_owned_routing_spec() -> None:
    source = Path("backend/src/core/container/api_container.py").read_text(encoding="utf-8")
    assert "build_handler_bindings(" in source


def test_set_container_ignores_missing_app_context() -> None:
    set_container(container=object(), app=None)


def test_set_container_sets_and_clears_app_state() -> None:
    app = FastAPI()
    container = object()

    set_container(container, app=app)
    assert app.state.container is container

    set_container(None, app=app)
    assert not hasattr(app.state, "container")


def test_set_container_rejects_unforced_replacement() -> None:
    app = FastAPI()
    first = object()
    second = object()

    set_container(first, app=app)
    with pytest.raises(RuntimeError, match="Container already set"):
        set_container(second, app=app)


def test_set_container_force_replaces_existing_container() -> None:
    app = FastAPI()
    first = object()
    second = object()

    set_container(first, app=app)
    set_container(second, app=app, force=True)

    assert app.state.container is second


def test_resolve_app_prefers_request_context() -> None:
    request_app = FastAPI()
    websocket_app = FastAPI()
    request = SimpleNamespace(app=request_app)
    websocket = SimpleNamespace(app=websocket_app)

    assert _resolve_app(request=request, websocket=websocket) is request_app


@pytest.mark.asyncio
async def test_get_container_raises_without_context() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await get_container()

    assert exc_info.value.status_code == 500
    assert "requires request or websocket context" in exc_info.value.detail


@pytest.mark.asyncio
async def test_get_container_raises_when_app_container_missing() -> None:
    app = FastAPI()

    with pytest.raises(HTTPException) as exc_info:
        await get_container(request=SimpleNamespace(app=app))

    assert exc_info.value.status_code == 503
    assert "Container not available" in exc_info.value.detail


@pytest.mark.asyncio
async def test_get_container_resolves_from_websocket_context() -> None:
    app = FastAPI()
    container = object()
    set_container(container, app=app)

    resolved = await get_container(websocket=SimpleNamespace(app=app))

    assert resolved is container


@pytest.mark.asyncio
async def test_dependency_helpers_return_container_members() -> None:
    session_manager = object()
    handler_registry = object()
    container = SimpleNamespace(
        session_manager=session_manager,
        handler_registry=handler_registry,
    )

    assert await get_session_manager(container) is session_manager
    assert await get_handler_registry(container) is handler_registry
