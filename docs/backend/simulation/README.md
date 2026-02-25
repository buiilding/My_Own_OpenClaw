---
summary: "Backend simulation docs sub-hub for mock LLM entrypoints, lifespan override wiring, and native tool-call adaptation flow."
read_when:
  - When changing `backend/src/simulation/*` entrypoints or mock LLM sequencing behavior.
  - When debugging simulation-mode startup, mock-client injection, or legacy simulation payload parsing.
title: "Backend Simulation Docs Hub"
---

# Backend Simulation Docs Hub

## Deep Pages

- [Simulation Backend and Mock LLM Runtime Reference](simulation_backend_and_mock_llm_runtime_reference.md)
- [Backend Simulation Entrypoints Docs Hub](entrypoints/README.md)
- [Package Runner and Module Alias Uvicorn Bootstrap Contract Reference](entrypoints/package_runner_and_module_alias_uvicorn_bootstrap_contract_reference.md)

## Code Scope

- `backend/src/simulation/*`
- `backend/src/core/container/session_runtime.py`
- `backend/src/api/app_assembly.py`
- `tests/backend/test_mock_llm_client.py`
- `tests/backend/test_mock_llm_browser_client.py`
