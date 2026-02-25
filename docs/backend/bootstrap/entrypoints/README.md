---
summary: "Backend bootstrap entrypoint docs sub-hub for shared logging initialization and uvicorn runner wrappers used by production and simulation startup modules."
read_when:
  - When changing `backend/src/core/bootstrap/entrypoint.py` or modules that call its logger/uvicorn helpers.
  - When debugging startup logging profile behavior or uvicorn access-log/reload flag differences across entrypoints.
title: "Backend Bootstrap Entrypoints Docs Hub"
---

# Backend Bootstrap Entrypoints Docs Hub

## Deep Pages

- [Shared Entrypoint Logger and Uvicorn Runner Contract Reference](shared_entrypoint_logger_and_uvicorn_runner_contract_reference.md)

## Related Pages

- [Backend Bootstrap Docs Hub](../README.md)
- [Backend Core Logging Docs Hub](../../core/logging/README.md)
- [Backend Simulation Entrypoints Docs Hub](../../simulation/entrypoints/README.md)

## Code Scope

- `backend/src/core/bootstrap/entrypoint.py`
- `backend/src/main.py`
- `backend/src/simulation/app_factory.py`
- `backend/src/simulation/main.py`
- `backend/src/simulation/browser.py`
