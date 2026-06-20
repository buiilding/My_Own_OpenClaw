---
summary: "Local-runtime browser docs sub-hub for the Browser Use CLI adapter, canonical browser contract validation, and local-runtime browser launch/result boundaries."
read_when:
  - When changing local-runtime Browser Use engine routing, browser action validation, or Browser Use daemon invocation.
  - When debugging browser action failures across adapter routing, action parameter normalization, or Browser Use CLI execution.
title: "Local-Runtime Browser Docs Hub"
---

# Local-Runtime Browser Docs Hub

Current browser tool execution routes through `frontend/src/main/python/tools/browser/browser_use_engine.py`, which adapts canonical browser payloads to the official `browser-use[cli]` package. The local-runtime Python browser adapter owns runtime validation, Chrome/CDP launch policy, local tool transport, browser-local files, and result normalization; Browser Use owns browser/session mechanics.

## Deep Pages

- [Browser Runtime Deterministic Extraction Contract Reference](browser_runtime_deterministic_extraction_contract_reference.md)
- [Browser Contracts Docs Hub](contracts/README.md)
- [Schema Registry and Action Validation Boundary Reference](contracts/schema_registry_and_action_validation_boundary_reference.md)
- [Browser Chrome Docs Hub](chrome/README.md)
- [Chrome Detection, Launcher, and CDP Session Reference](chrome/chrome_detection_launcher_and_cdp_session_reference.md)

## Related Pages

- [Browser Automation Stack](../browser_automation_stack.md)
- [Browser Action Runtime Reference](../browser_action_runtime_reference.md)
- [Local Runtime JSON-RPC Reference](../local_backend_jsonrpc_reference.md)

## Code Scope

- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `frontend/src/main/python/tools/browser/chrome_detection.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `frontend/src/main/python/tools/browser/content_extraction.py`
- `frontend/src/main/python/tools/browser/file_store.py`
- `frontend/src/main/python/windie_shared/browser_contract*.py`
- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/local_backend.py`
- `tests/sidecar/tools/test_chrome_detection.py`
- `tests/sidecar/tools/test_chrome_launcher.py`
- `tests/sidecar/tools/test_browser_use_engine.py`
- `tests/sidecar/tools/test_browser_tool.py`
