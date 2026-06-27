---
summary: "Local-runtime tool-registry docs sub-hub for exposed-tool parity, lazy import registration behavior, and native ToolResult contracts backed by the local-runtime Python implementation."
read_when:
  - When changing local-runtime Python tool registration/exposure lists or execution result handling.
  - When debugging `Tool not found`, invalid tool return formats, or backend-schema parity drift.
title: "Local-Runtime Tool Registry Docs Hub"
---

# Local-Runtime Tool Registry Docs Hub

## Deep Pages

- [Tool Registry Exposed Schema and Result Contract Reference](tool_registry_exposed_schema_and_result_contract_reference.md)

## Related Pages

- [Local-Runtime Tool Catalog and Execution Model](../../tool_catalog_and_execution_model.md)
- [Local-Runtime Tools Docs Hub](../README.md)

## Code Scope

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/result.py`
- `frontend/src/main/python/tools/schemas.py`
- `frontend/src/main/python/local_backend.py`
- `tests/sidecar/test_tool_registry.py`
