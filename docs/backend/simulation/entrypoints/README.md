---
summary: "Backend simulation entrypoint docs sub-hub for package/module launch paths, removed simulation computer alias behavior, and reload/access-log profile differences."
read_when:
  - When changing simulation launch modules (`__main__`, `main.py`) or runner flags.
  - When debugging inconsistent simulation startup behavior between package-runner and explicit module entrypoints.
  - When searching for the removed `backend.src.simulation.computer` module or simulation computer alias.
title: "Backend Simulation Entrypoints Docs Hub"
---

# Backend Simulation Entrypoints Docs Hub

## Deep Pages

- [Package Runner and Main Module Uvicorn Bootstrap Contract Reference](package_runner_and_main_module_uvicorn_bootstrap_contract_reference.md)

## Related Pages

- [Backend Simulation Docs Hub](../README.md)
- [Backend Bootstrap Entrypoints Docs Hub](../../bootstrap/entrypoints/README.md)

## Code Scope

- `backend/src/simulation/__main__.py`
- `backend/src/simulation/main.py`
- `backend/src/simulation/app_factory.py`

Removed alias:

- `backend/src/simulation/computer.py` no longer exists; launch default
  simulation through `python -m backend.src.simulation` or explicit development
  simulation through `python -m backend.src.simulation.main`.
- `backend/src/core/bootstrap/entrypoint.py`
