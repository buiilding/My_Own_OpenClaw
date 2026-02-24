---
summary: "Deep reference for backend-sidecar browser schema parity checks, action-coverage guarantees, and the validation-boundary split between backend acceptance and sidecar runtime enforcement."
read_when:
  - When adding new browser actions and verifying backend schema, sidecar schema, runtime handler, and adapter coverage stay aligned.
  - When investigating payloads that parse in backend but fail in sidecar compatibility adapter/runtime layers.
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

Backend browser tool parse boundary is intentionally wide:

- `BrowserControlArgs` accepts large compatibility field superset
- unknown extras are ignored
- remote payload emits only explicit/non-default fields

### Sidecar boundary

Sidecar enforcement is stricter and action-aware:

- action schema routing (`BROWSER_SCHEMAS`) validates action-specific requirements
- adapter can reject compatibility fields for selected actions (for example snapshot/extract/screenshot compatibility modes)
- runtime provider enforces action availability and connection preconditions

Result:

- backend parse success does not guarantee sidecar execution success
- debugging must inspect both boundaries

## Parity Axes That Must Stay Aligned

When introducing or changing browser actions, verify all four layers:

1. backend action literals (`backend/src/tools/browser/schema_types.py`)
2. sidecar schema registry keys (`frontend/src/main/python/tools/browser/schemas.py`, `BROWSER_SCHEMAS`)
3. adapter/runtime dispatch support (`BrowserUseCompatibilityAdapter`, native handler registry)
4. Browser Use runtime action registry coverage

## Existing Parity Guards

`tests/sidecar/tools/test_browser_use_tool_parity.py` enforces:

- Browser Use import origin resolves to vendored runtime only
- `browser-use` pip dependency absent from sidecar requirements
- sidecar `BROWSER_SCHEMAS` covers every Browser Use registry action
- backend `BrowserControlArgs` action literal covers every Browser Use registry action
- native runtime handler registry covers every Browser Use action
- compatibility adapter dispatch executes every Browser Use action with minimal args

`tests/backend/test_browser_remote_tool.py` additionally confirms backend tool registration and baseline schema availability.

## Typical Drift Failure Patterns

### Pattern 1: New action added only in one layer

Symptoms:

- backend accepts action but adapter returns unsupported
- adapter supports action but backend literal parse fails before transport

Fix path:

- update backend literals + sidecar schemas + adapter/runtime registry + parity tests together

### Pattern 2: Field alias accepted but semantically rejected

Symptoms:

- payload parses in backend/unified model
- sidecar returns `INVALID_ARGUMENT` for compatibility field on specific actions

Fix path:

- align docs and action-specific normalization rules
- keep intentional rejection behavior explicit in adapter docs/tests

### Pattern 3: Default stripping changes runtime behavior

Because backend uses `model_dump(exclude_defaults=True, exclude_none=True)`, sidecar may receive missing fields and apply different defaults.

Fix path:

- inspect backend serialized args payload
- verify sidecar default assumptions and adapter normalization paths

## Debug Procedure

1. capture backend serialized browser args payload (`RemoteToolResult.args`)
2. validate expected action exists in sidecar `BROWSER_SCHEMAS`
3. check adapter branch for action family:
   - pass-through vs direct vs compatibility rewrite
4. inspect runtime provider/handler lookup for action
5. confirm parity tests include the action and minimal argument case

## Change Checklist for Browser Action Additions

- add/update backend action literal and fields
- add/update sidecar schema entry and validation model
- add/update adapter dispatch mapping and normalization
- add/update native runtime handler map
- extend parity tests and backend schema tests
- update docs in both backend and frontend browser sections

## Related Pages

- [Backend Browser Schema Docs Hub](README.md)
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Frontend Sidecar Browser Docs Hub](../../../../frontend/sidecar/browser/README.md)
