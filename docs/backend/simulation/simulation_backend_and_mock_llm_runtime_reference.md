---
summary: "Backend simulation runtime reference: app entrypoints, lifespan container overrides, BaseSimulationLLMClient behavior, native tool-call adapter semantics, and test-backed sequence guarantees."
read_when:
  - When modifying simulation backend startup/lifespan or replacing mock-client injection strategy.
  - When updating hardcoded simulation sequences, native tool-call normalization, or browser/computer simulation behavior.
title: "Simulation Backend and Mock LLM Runtime Reference"
---

# Simulation Backend and Mock LLM Runtime Reference

## Canonical Modules

- `backend/src/simulation/app_factory.py`
- `backend/src/simulation/lifespan_factory.py`
- `backend/src/simulation/main.py`
- `backend/src/simulation/browser.py`
- `backend/src/simulation/computer.py`
- `backend/src/simulation/base_mock_llm_client.py`
- `backend/src/simulation/native_tool_adapter.py`
- `backend/src/simulation/mock_llm_client.py`
- `backend/src/simulation/mock_llm_browser_client.py`

## Purpose and Boundary

Simulation mode keeps backend transport/session/tool pipelines real, while replacing provider LLM responses with deterministic hardcoded steps.

What stays real:

- FastAPI app + routes (`create_api_app`)
- websocket/HTTP contracts
- session creation and interaction loop
- tool dispatch path and frontend tool-result loop

What is replaced:

- `core.llm_client` provider factory is overridden to use simulation mock clients.

## Entrypoints and Titles

### Default simulation

- module: `backend.src.simulation.main`
- client: `MockLLMClient`
- title: `Desktop Assistant (Simulation)`

### Browser simulation

- module: `backend.src.simulation.browser`
- client: `MockLLMBrowserClient`
- title: `Desktop Assistant (Browser Simulation)`

### Computer alias entrypoint

- module: `backend.src.simulation.computer`
- alias to default simulation app (`main:app`)
- uses explicit `uvicorn.run(...)` helper wrapper

### Package runner

- `python -m backend.src.simulation` maps to `backend.src.simulation.main:app`.

## App Factory Contract

`create_simulation_app(...)`:

1. builds simulation lifespan via `build_simulation_lifespan(...)`
2. calls shared `create_api_app(...)` (same CORS/routes stack as production backend)

`run_simulation_app(...)`:

- delegates to `run_uvicorn_app(...)` with `reload=True` and `reload_dirs=["backend/src"]`.

## Lifespan Override Flow

`build_simulation_lifespan(...)` defines a runtime override sequence:

1. custom `SimulationInitializationCoordinator` initializes normal `Container`
2. binds container to app via `set_container(container, app=app, force=True)`
3. creates `mock_llm_client_factory(session_config=None)` wrapper
4. overrides DI provider: `container._di_container.core.llm_client.override(...)`
5. sets `container._mock_llm_factory` for session-runtime lazy client resolution
6. calls `container.invalidate_session_factory()` so future sessions use mock factory
7. on shutdown, clears app container binding via `set_container(None, app=app, force=True)`

Key coupling:

- `SessionRuntimeCoordinator` checks `container._mock_llm_factory` and uses it when creating session LLM clients.

## BaseSimulationLLMClient Runtime Semantics

`BaseSimulationLLMClient` implements deterministic iteration over static responses:

- `_responses`: list of pre-authored turns
- `_iteration`: current response index
- `_max_iterations`: response count
- `_pending_final_response`: deferred plain text when a tool-turn includes both tool calls and text

### `get_completion_response(...)` behavior

- if `_pending_final_response` exists: emits plain text stop turn
- otherwise parses current response through `build_normalized_response(...)`
- when both `tool_calls` and `content` exist in one turn:
  - returns tool turn with empty content
  - stores text in `_pending_final_response` for next call

This mimics native provider behavior where tool turns do not simultaneously emit final assistant prose.

### Streaming behavior

- `get_completion_stream(...)` yields character-by-character `ChunkEvent` from raw response text.
- no separate structured tool stream path; tool semantics are encoded in response payload text and later normalized in non-stream completion path.

## Native Tool Adapter Semantics

`native_tool_adapter.py` converts legacy simulation payload text to normalized tool-call response objects.

Accepted legacy formats:

- `{"functionCall": {...}}`
- `{"metadata": {...}, "action": {"functionCall": {...}}}`
- `{"response": "..."}`
- multi-object newline-delimited combinations

Normalization behavior:

- parses line-delimited JSON objects first, fallback to single JSON object
- extracts tool calls and assigns deterministic IDs: `{call_id_prefix}_{iteration}_{n}`
- injects legacy metadata under `arguments["metadata"]` when present
- sets `finish_reason`:
  - `tool_calls` when calls extracted
  - `stop` when plain content only

If payload is not JSON-parsable:

- returns plain text content unchanged (no tool_calls).

## Simulation Sequences

### `MockLLMClient`

- sequence source: `SIMULATION_RESPONSES`
- focuses on computer-use style flow:
  - shell launch
  - OCR/prediction-guided `mouse_control`
  - `keyboard_control` bundles
  - `scroll_control`

Platform-aware detail:

- Chrome launch command is selected by OS (`start chrome`, `open -a "Google Chrome"`, or `google-chrome`).

### `MockLLMBrowserClient`

- sequence source: `BROWSER_SIMULATION_RESPONSES`
- focuses on browser tool flow:
  - connect
  - navigate
  - snapshot/evaluate/type/wait/screenshot/close
- includes a final close+text turn that exercises deferred final-text logic.

## Test-Backed Invariants

Primary tests:

- `tests/backend/test_mock_llm_client.py`
- `tests/backend/test_mock_llm_browser_client.py`

Validated behaviors include:

- normalized tool-call IDs/payload shape
- metadata preservation for computer-use tool calls
- multi-tool turn extraction
- deferred final plain-text emission after final tool turn
- reset behavior and factory helpers

## Operational Notes

- simulation mode still depends on frontend tool execution returning results for tool turns.
- app startup logs explicitly indicate simulation mode and selected mock client.
- both simulation and production entrypoints use shared CORS route assembly (`create_api_app`), so API surface remains aligned.

## Debug Checklist

If simulation returns plain text instead of tool calls:

1. inspect authored response JSON validity
2. ensure payload includes `functionCall` shape expected by adapter
3. verify newline-delimited objects are valid JSON per line

If sessions still use real provider:

1. verify lifespan override ran (`LLM client factory overridden...` log)
2. verify `container.invalidate_session_factory()` executed
3. verify session was created after override (not before)

If final completion text appears to vanish:

1. check `_pending_final_response` path in `BaseSimulationLLMClient`
2. verify caller requests another completion turn after tool turn completion

