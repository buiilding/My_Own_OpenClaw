---
summary: "Backend config docs sub-hub for canonical config fields, runtime normalization policy, and client settings patch boundaries."
read_when:
  - When adding/changing backend config fields or defaults.
  - When debugging runtime config assembly or session-level config propagation.
title: "Backend Config Docs Hub"
---

# Backend Config Docs Hub

## Deep Pages

- [Configuration Change Workflow](../../operations/configuration_change_workflow.md)
- [Backend Config and Container Change Workflow](backend_config_and_container_change_workflow.md)
- [Config Fields and Runtime Policy](config_fields_and_runtime_policy.md)
- [Input Validation and Client Settings Patch Guard Reference](../core/validation/input_validation_and_frontend_patch_guard_reference.md)

## Code Scope

- `backend/src/core/config/*`
- `backend/src/core/container/config_updater.py`
- `backend/src/agent/session/config_runtime.py`
