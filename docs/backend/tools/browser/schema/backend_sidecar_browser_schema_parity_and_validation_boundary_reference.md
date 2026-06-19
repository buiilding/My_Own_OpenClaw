---
summary: "Deep reference for backend/local-runtime browser schema parity checks, action-coverage guarantees, and the strict shared browser validation boundary."
read_when:
  - When adding/removing browser actions and verifying backend schema, local-runtime validation, Browser Use engine dispatch, and runtime handler coverage stay aligned.
  - When investigating payloads that parse in backend but fail in local-runtime enforcement.
title: "Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference"
---

# Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference

## Canonical Modules and Tests

- `backend/src/tools/browser/shared_contract_loader.py`
- `backend/src/tools/remote_tools/browser.py`
- `frontend/src/main/python/windie_shared/browser_contract*.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `tests/backend/test_browser_remote_tool.py`
- `tests/sidecar/tools/test_browser_schemas.py`
- `tests/sidecar/tools/test_browser_use_engine.py`
- `tests/sidecar/tools/test_browser_use_engine_runtime.py`

## Validation Boundary Model

### Backend boundary

Backend browser parse boundary is strict:

- `BrowserControlArgs` accepts only canonical grouped browser actions
- unknown extras are rejected by the selected action model

Backend model-facing declaration boundary is narrower:

- `RemoteBrowserTool.get_json_schema(...)` projects a canonical action enum for model/tool-calling output
- projection emits the strict root-object schema derived from the shared action catalog

Backend runtime gate in `RemoteBrowserTool`:

- payloads that pass backend validation are serialized directly to the local-runtime tool path

### Local-runtime boundary

Local-runtime enforcement is action-aware and runtime-focused:

- `browser_tool` validates grouped `BrowserControlArgs` before execution
- `browser_use_engine.py` maps canonical actions to Browser Use CLI calls or dedicated-profile helpers
- Browser Use numeric indexes remain the runtime element-reference model

Result:

- backend parse success does not guarantee end-to-end execution success
- runtime errors after validation are browser/session/engine operational failures, not schema compatibility failures

## Parity Axes That Must Stay Aligned

When changing browser actions, verify four layers:

1. backend-loaded shared contract action literals
2. shared browser action catalog order (`BROWSER_ACTION_CONTRACTS`)
3. sidecar tool validation and engine mapping (`browser_tool.py`, `browser_use_engine.py`)
4. Browser Use runtime handler coverage

## Existing Parity Guards

`tests/sidecar/tools/test_browser_schemas.py` and the Browser Use engine tests enforce:

- `BrowserControlArgs` enforces the shared strict grouped action contract
- backend remote-tool validation and local-runtime validation stay aligned around the same action surface
- `BrowserUseEngineRuntime` covers the supported Browser Use action set

`tests/backend/test_browser_remote_tool.py` additionally checks backend schema/tool registration and strict payload projection behavior.
It now also checks model-facing action/property projection boundaries.

## Typical Drift Failure Patterns

### Pattern 1: Action added only in one layer

Symptoms:

- backend accepts action but local runtime rejects as unsupported
- local runtime supports action but backend literal parse fails upstream

### Pattern 2: Runtime coverage drift

Symptoms:

- action is schema-valid but has no Browser Use engine handler
- action is implemented but missing from the schema contract

### Pattern 3: Backend acceptance vs local-runtime rejection

Symptoms:

- payload parses in backend model
- local runtime returns `INVALID_ARGUMENT` because shared wrappers drifted or executable args are malformed

### Pattern 4: Default stripping side effects

Backend transport strips defaults/`None`; local runtime receives sparse payload and may apply different defaults.

## Debug Procedure

1. record serialized backend payload (`RemoteToolResult.args`)
2. verify backend validation decision
3. verify shared contract/action registry coverage
4. inspect Browser Use engine parameter mapping
5. inspect runtime handler dispatch and error code

## Change Checklist

- update backend action literals
- update backend runtime docs/tests (`RemoteBrowserTool`)
- update shared contract/action mappings
- update Browser Use engine dispatch/normalization
- run parity + engine + backend schema tests
- update backend + frontend browser docs in same change

## Related Pages

- [Backend Browser Schema Docs Hub](README.md)
- [Browser Control Unified Schema Reference](browser_control_unified_schema_reference.md)
- [Browser Remote Schema Surface Reference](../browser_remote_schema_surface_reference.md)
- [Local-Runtime Browser Docs Hub](../../../../frontend/sidecar/browser/README.md)
- [Local-Runtime Browser Contracts Docs Hub](../../../../frontend/sidecar/browser/contracts/README.md)
