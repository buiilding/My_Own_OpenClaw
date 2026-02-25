---
summary: "Deep reference for bootstrap entrypoint helpers: logging initialization wrapper, access-log profile gate, and shared uvicorn.run kwargs contract used across backend and simulation launchers."
read_when:
  - When changing `initialize_entrypoint_logger`, `is_verbose_access_log`, or `run_uvicorn_app` behavior.
  - When debugging startup launches that differ on access logs, reload flags, or logger profile setup.
title: "Shared Entrypoint Logger and Uvicorn Runner Contract Reference"
---

# Shared Entrypoint Logger and Uvicorn Runner Contract Reference

## Canonical Modules

- `backend/src/core/bootstrap/entrypoint.py`
- `backend/src/core/logging_setup.py`
- `backend/src/main.py`
- `backend/src/simulation/app_factory.py`

## `initialize_entrypoint_logger(module_name)` Contract

Behavior:

1. calls `configure_logging()`
2. returns `logging.getLogger(module_name)`

Design intent:

- entrypoint modules share one initialization pattern
- callers do not duplicate logging profile bootstrap code

Current call sites include production (`backend/src/main.py`) and simulation modules (`simulation/main.py`, `simulation/browser.py`).

## `is_verbose_access_log()` Contract

Returns `True` only when:

- `WINDIEOS_LOG_PROFILE` env var resolves to `"verbose"` (case-insensitive)

All other values (or unset) return `False`.

## `run_uvicorn_app(...)` Contract

Input defaults:

- `host="0.0.0.0"`
- `port=8765`
- `reload=False`
- optional `reload_dirs`

Behavior:

- builds `run_kwargs` with `host`, `port`, `reload`, and `access_log` from `is_verbose_access_log()`
- converts provided `reload_dirs` iterable into a concrete list before passing to uvicorn
- calls `uvicorn.run(app_path, **run_kwargs)`

No extra side effects beyond process launch.

## Caller Expectations

- production main runs with `reload=False`
- simulation app factory (`run_simulation_app`) enables `reload=True` and `reload_dirs=["backend/src"]`

Shared helper keeps access-log profile behavior consistent between both modes.

## Drift Hotspots

1. Changing env var semantics in `is_verbose_access_log` can silently flip access-log volume in all entrypoints.
2. Removing `list(reload_dirs)` coercion can break callers that pass generators/iterables.
3. Bypassing this helper in new entrypoints can reintroduce divergent host/port/access-log defaults.

## Related Pages

- [Backend Bootstrap Entrypoints Docs Hub](README.md)
- [Backend Core Logging Docs Hub](../../core/logging/README.md)
- [Simulation Backend and Mock LLM Runtime Reference](../../simulation/simulation_backend_and_mock_llm_runtime_reference.md)
