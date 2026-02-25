---
summary: "Deep reference for backend-sidecar browser schema parity checks, action-coverage guarantees, and validation-boundary split across canonical, legacy, and removed aliases."
read_when:
  - When adding/removing browser actions and verifying backend schema, sidecar schema, adapter dispatch, and runtime handler coverage stay aligned.
  - When investigating payloads that parse in backend but fail in backend runtime alias gates or sidecar runtime enforcement.
title: "Backend-Sidecar Browser Schema Parity and Validation Boundary Reference"
---

# Backend-Sidecar Browser Schema Parity and Validation Boundary Reference

## Canonical Modules and Tests

- `backend/src/tools/browser/browser_control_args_schema.py`
- `backend/src/tools/browser/schemas.py`
- `backend/src/tools/remote_tools/browser.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_adapter.py`
- `tests/backend/test_browser_remote_tool.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`

## Validation Boundary Model

### Backend boundary

Backend browser parse boundary is broad:

- `BrowserControlArgs` accepts canonical + compatibility action families
- unknown extras are ignored
- removed aliases remain parseable for explicit migration errors

Backend runtime gate in `RemoteBrowserTool`:

- removed aliases (`open`, `switch_tab`, `press`, `act`) are blocked immediately
- legacy alias `type` is controlled by strict/allow env gates

### Sidecar boundary

Sidecar enforcement is action-aware and runtime-focused:

- action schema routing (`BROWSER_SCHEMAS`) validates sidecar action models
- `browser_tool` applies removed/legacy alias policy gates
- adapter/runtime normalize and validate action-specific params

Result:

- backend parse success does not guarantee end-to-end execution success

## Parity Axes That Must Stay Aligned

When changing browser actions, verify four layers:

1. backend action literals and alias categories (`schema_types.py`)
2. sidecar schema registry keys (`schemas.py`, `BROWSER_SCHEMAS`)
3. sidecar tool/adapter alias-gate policy (`browser_tool.py`, `browser_adapter.py`)
4. Browser Use runtime handler coverage

## Existing Parity Guards

`tests/sidecar/tools/test_browser_use_tool_parity.py` enforces:

- vendored Browser Use import origin
- `browser-use` pip dependency absence in sidecar requirements
- sidecar `BROWSER_SCHEMAS` covers Browser Use runtime registry actions
- backend `BrowserControlArgs` action literals cover Browser Use actions
- native runtime handler registry covers Browser Use actions

`tests/backend/test_browser_remote_tool.py` additionally checks backend schema/tool registration and alias policy behavior.

## Typical Drift Failure Patterns

### Pattern 1: Action added only in one layer

Symptoms:

- backend accepts action but sidecar rejects as unsupported
- sidecar supports action but backend literal parse fails upstream

### Pattern 2: Alias category drift

Symptoms:

- alias documented as legacy but implemented as removed (or inverse)
- strict/allow env behavior differs between backend and sidecar

### Pattern 3: Backend acceptance vs sidecar rejection

Symptoms:

- payload parses in backend model
- sidecar returns `INVALID_ARGUMENT` after normalization/compat rejection

### Pattern 4: Default stripping side effects

Backend transport strips defaults/`None`; sidecar receives sparse payload and may apply different defaults.

## Debug Procedure

1. capture backend serialized payload (`RemoteToolResult.args`)
2. verify backend gate decision (removed alias block vs legacy gate vs pass-through)
3. verify sidecar schema/action registry coverage
4. inspect adapter param normalization path
5. inspect runtime handler dispatch and error code

## Change Checklist

- update backend action literals and alias maps
- update backend runtime gate docs/tests (`RemoteBrowserTool`)
- update sidecar schema/action mappings and alias gates
- update adapter dispatch/normalization
- run parity + adapter + backend schema tests
- update backend + frontend browser docs in same change

## Related Pages

- [Backend Browser Schema Docs Hub](README.md)
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Frontend Sidecar Browser Docs Hub](../../../../frontend/sidecar/browser/README.md)
- [Frontend Sidecar Browser Contracts Docs Hub](../../../../frontend/sidecar/browser/contracts/README.md)
