---
summary: "Backend API app assembly reference: FastAPI creation path, router registration order, default CORS policy, lifespan container set/clear semantics, and request/websocket dependency resolution contracts."
read_when:
  - When changing backend FastAPI app creation, router registration, or CORS defaults.
  - When debugging `app.state.container` availability errors in HTTP or WebSocket dependency resolution.
title: "App Assembly and Container Dependency Reference"
---

# App Assembly and Container Dependency Reference

## Canonical Modules

- `backend/src/main.py`
- `backend/src/api/app_assembly.py`
- `backend/src/api/routes/__init__.py`
- `backend/src/api/deps.py`
- `backend/src/core/bootstrap/coordinator.py`

## FastAPI App Creation Path

Runtime entrypoint:

- `backend/src/main.py`

App construction:

1. `create_api_app(title, lifespan, allow_origins?)`
2. `configure_default_cors(...)`
3. `register_api_routes(...)`

Result:

- one FastAPI app with shared middleware + canonical route set

## Router Registration Contract

Router list source:

- `backend/src/api/routes/__init__.py:API_ROUTERS`

Current registration order:

1. websocket router (`/ws`)
2. artifact router (`/api/artifacts`)
3. memory embeddings router (`/api/embeddings`)
4. memory semantic router (`/api/semantic`)

`register_api_routes(...)` includes routers in tuple order.

## Default CORS Policy

`configure_default_cors(...)` defaults:

- `allow_origins=["http://localhost:5173"]`
- `allow_credentials=True`
- `allow_methods=["*"]`
- `allow_headers=["*"]`

Override path:

- pass `allow_origins` explicitly to `create_api_app(...)`

## Lifespan Container Set/Clear Sequence

`main.py` lifespan behavior:

Startup:

1. build `InitializationCoordinator()`
2. `await coordinator.initialize(app)` -> returns container/session manager
3. `set_container(container, app=app, force=True)`

Shutdown:

1. `set_container(None, app=app, force=True)`
2. app-level shutdown log completion

`force=True` ensures controlled replacement/clear during startup-shutdown lifecycle transitions.

## Container Storage and Override Guard

Container storage location:

- `app.state.container`

`set_container(...)` guard behavior:

- without app argument: logs debug + no-op (legacy global path intentionally ignored)
- if existing different container and `force=False`: raises `RuntimeError`
- clear path removes `app.state.container` attribute

## Request/WebSocket Dependency Resolution

Dependency helpers in `api/deps.py`:

- `_resolve_app(request, websocket)` chooses app context
- `get_container(...)` reads `app.state.container`

`get_container` failure contracts:

- missing request/websocket context -> `HTTP 500`
  - detail: `Container dependency requires request or websocket context.`
- missing `app.state.container` -> `HTTP 503`
  - detail: `Application not initialized. Container not available.`

These apply to both HTTP dependencies and WebSocket dependency wiring.

## Typed Dependency Aliases

Canonical aliases:

- `ContainerDep`
- `SessionManagerDep`
- `HandlerRegistryDep`

Resolution path:

1. `ContainerDep` -> `get_container`
2. `SessionManagerDep` -> `get_session_manager(container)`
3. `HandlerRegistryDep` -> `get_handler_registry(container)`

## Operational Failure Modes

If routes return `503 Application not initialized` after startup:

1. verify lifespan startup reached `set_container(..., force=True)`
2. verify no custom code cleared `app.state.container` early
3. verify app instance mismatch (handlers bound to one app, requests hitting another)

If container replacement throws runtime error:

1. check caller used `force=False` with existing different instance
2. verify replacement is expected lifecycle behavior, then use controlled `force=True`

If websocket deps fail unexpectedly:

1. confirm dependency called with `websocket` context (not bare function invocation)
2. confirm app initialization completed before WS accepts traffic

## Debug Checklist

When changing app assembly:

1. verify new router added to `API_ROUTERS`
2. verify route order implications (if middleware/overlapping paths matter)
3. verify CORS default still valid for local frontend target
4. verify lifespan still sets and clears container on same app instance
