---
summary: "Deep reference for simulation entrypoint launch paths: package `-m` runner, removed simulation computer alias, and main-module shared app factory behavior."
read_when:
  - When changing simulation startup scripts.
  - When debugging reload/access-log flag differences across simulation launch commands.
  - When searching for removed `backend.src.simulation.computer`, simulation computer alias, deleted backend simulation computer module, or old computer simulation module launch behavior.
title: "Package Runner and Main Module Uvicorn Bootstrap Contract Reference"
---

# Package Runner and Main Module Uvicorn Bootstrap Contract Reference

## Canonical Modules

- `backend/src/simulation/__main__.py`
- `backend/src/simulation/main.py`
- `backend/src/simulation/app_factory.py`

## Removed Simulation Computer Alias

- `backend/src/simulation/computer.py` and `backend.src.simulation.computer`
  are no longer launch aliases.
- Searches for a deleted backend simulation computer module belong here; use the
  package runner or `backend.src.simulation.main` instead.

## Package Runner Contract (`python -m backend.src.simulation`)

`backend/src/simulation/__main__.py`:

- launches `backend.src.simulation.main:app` directly with `uvicorn.run`
- host `0.0.0.0`, port `8765`
- `access_log` toggled by `WINDIEOS_LOG_PROFILE == "verbose"`
- no `reload`/`reload_dirs` arguments in this path

## Main Module Contract (`python -m backend.src.simulation.main`)

`backend/src/simulation/main.py`:

- builds app via `create_simulation_app(...)` (shared lifespan + mock client injection)
- module `__main__` path calls `run_simulation_app("backend.src.simulation.main:app")`
- `run_simulation_app` delegates to shared `run_uvicorn_app` with:
  - `reload=True`
  - `reload_dirs=["backend/src"]`

## Launch-Path Differences to Keep in Mind

- `__main__.py` path currently has no reload configuration
- `main.py` enables reload for development
- both paths target the same app module (`backend.src.simulation.main:app`) and same default host/port

## Drift Hotspots

1. Diverging host/port/access-log defaults between entrypoint files creates environment-specific behavior surprises.
2. Inconsistent reload flags between package-runner and module-runner paths can confuse development workflows.
3. Replacing shared app-factory path in `main.py` breaks alignment with documented simulation lifespan override behavior.

## Related Pages

- [Backend Simulation Entrypoints Docs Hub](README.md)
- [Simulation Backend and Mock LLM Runtime Reference](../simulation_backend_and_mock_llm_runtime_reference.md)
- [Shared Entrypoint Logger and Uvicorn Runner Contract Reference](../../bootstrap/entrypoints/shared_entrypoint_logger_and_uvicorn_runner_contract_reference.md)
