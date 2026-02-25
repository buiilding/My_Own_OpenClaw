---
summary: "Backend simulation entrypoint docs sub-hub for package/module launch aliases, direct uvicorn bootstraps, and reload/access-log profile differences."
read_when:
  - When changing simulation launch modules (`__main__`, `computer.py`, `main.py`) or runner flags.
  - When debugging inconsistent simulation startup behavior between package-runner and explicit module entrypoints.
title: "Backend Simulation Entrypoints Docs Hub"
---

# Backend Simulation Entrypoints Docs Hub

## Deep Pages

- [Package Runner and Module Alias Uvicorn Bootstrap Contract Reference](package_runner_and_module_alias_uvicorn_bootstrap_contract_reference.md)

## Related Pages

- [Backend Simulation Docs Hub](../README.md)
- [Backend Bootstrap Entrypoints Docs Hub](../../bootstrap/entrypoints/README.md)

## Code Scope

- `backend/src/simulation/__main__.py`
- `backend/src/simulation/main.py`
- `backend/src/simulation/computer.py`
- `backend/src/simulation/app_factory.py`
- `backend/src/core/bootstrap/entrypoint.py`
