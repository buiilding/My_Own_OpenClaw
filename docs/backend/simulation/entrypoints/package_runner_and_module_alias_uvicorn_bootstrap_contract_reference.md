---
summary: "Deep reference for simulation entrypoint launch paths: package `-m` runner, main-module shared app factory path, and computer alias direct uvicorn wrapper behavior."
read_when:
  - When changing simulation startup scripts and deciding between shared `run_simulation_app` versus direct `uvicorn.run` launchers.
  - When debugging reload/access-log flag differences across simulation launch commands.
title: "Package Runner and Module Alias Uvicorn Bootstrap Contract Reference"
---

# Package Runner and Module Alias Uvicorn Bootstrap Contract Reference

## Canonical Modules

- `backend/src/simulation/__main__.py`
- `backend/src/simulation/main.py`
- `backend/src/simulation/computer.py`
- `backend/src/simulation/app_factory.py`

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

## Computer Alias Contract (`python -m backend.src.simulation.computer`)

`backend/src/simulation/computer.py`:

- imports `app` from `simulation.main` as alias entrypoint
- wraps explicit `uvicorn.run` in `run()` helper
- sets `reload=True` and `reload_dirs=["backend/src"]`
- uses same `WINDIEOS_LOG_PROFILE` access-log gate as package runner

## Launch-Path Differences to Keep in Mind

- `__main__.py` path currently has no reload configuration
- `main.py` and `computer.py` paths enable reload for development
- all paths target the same app module (`backend.src.simulation.main:app`) and same default host/port

## Drift Hotspots

1. Diverging host/port/access-log defaults between entrypoint files creates environment-specific behavior surprises.
2. Inconsistent reload flags between package-runner and module-runner paths can confuse development workflows.
3. Replacing shared app-factory path in `main.py` breaks alignment with documented simulation lifespan override behavior.

## Related Pages

- [Backend Simulation Entrypoints Docs Hub](README.md)
- [Simulation Backend and Mock LLM Runtime Reference](../simulation_backend_and_mock_llm_runtime_reference.md)
- [Shared Entrypoint Logger and Uvicorn Runner Contract Reference](../../bootstrap/entrypoints/shared_entrypoint_logger_and_uvicorn_runner_contract_reference.md)
