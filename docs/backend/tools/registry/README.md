---
summary: "Backend tools registry docs sub-hub for remote tool registration, schema cache/canonicalization behavior, and backend-frontend exposed-tool parity contracts."
read_when:
  - When adding/removing backend remote tools or changing schema declaration generation behavior.
  - When debugging schema cache drift, missing function declarations, or backend/frontend tool-name contract mismatches.
title: "Backend Tools Registry Docs Hub"
---

# Backend Tools Registry Docs Hub

## Deep Pages

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)

## Code Scope

- `backend/src/tools/registry.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/remote.py`
- `backend/src/tools/remote_tools/base.py`
- `backend/src/tools/remote_tools/registry.py`
- `backend/src/tools/remote_tools/computer.py`
- `backend/src/tools/remote_tools/system.py`
- `backend/src/tools/remote_tools/filesystem.py`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_remote_tools.py`
- `tests/backend/test_remote_tool_contract.py`
