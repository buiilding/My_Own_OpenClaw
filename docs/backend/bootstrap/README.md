---
summary: "Backend bootstrap docs sub-hub for startup sequencing, DI container lifecycle, and runtime config update propagation."
read_when:
  - When changing backend startup order, dependency initialization, or container-level config updates.
  - When debugging initialization race conditions or bootstrap rollback behavior.
title: "Backend Bootstrap Docs Hub"
---

# Backend Bootstrap Docs Hub

## Deep Pages

- [Bootstrap and Config](bootstrap_and_config.md)
- [Container DI and Initialization Lifecycle Reference](container_di_and_init_lifecycle_reference.md)
- [Backend Bootstrap Entrypoints Docs Hub](entrypoints/README.md)
- [Shared Entrypoint Logger and Uvicorn Runner Contract Reference](entrypoints/shared_entrypoint_logger_and_uvicorn_runner_contract_reference.md)

## Code Scope

- `backend/src/core/bootstrap/*`
- `backend/src/main.py`
- `backend/src/core/container/*`
