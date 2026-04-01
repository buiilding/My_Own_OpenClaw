---
summary: "Deep reference for sidecar browser schema registry behavior under the shared strict browser contract module."
read_when:
  - When adding/removing browser actions or changing sidecar browser validation rules.
  - When debugging schema parse errors before adapter/runtime execution.
title: "Schema Registry and Action Validation Boundary Reference"
---

# Schema Registry and Action Validation Boundary Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/browser_action_contract.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `tests/sidecar/tools/test_browser_schemas.py`

## Schema Model Topology

`schemas.py` re-exports the shared browser contract module and exposes:

- `BrowserControlArgs` discriminated grouped union
- `BROWSER_SCHEMAS` registry
- `get_browser_schema(action)` helper
- `validate_browser_args(action, args)` helper

Model policy:

- each action model uses `model_config.extra = "forbid"`
- required fields and model validators enforce action-level constraints

## Action Registry Contract (`BROWSER_SCHEMAS`)

Registry includes explicit entries for:

- the full canonical grouped browser action set

Removed aliases and compatibility-only fields are absent from the schema registry entirely.

## Validation Entry Point Behavior

`validate_browser_args(action, args)` flow:

1. resolve schema from `BROWSER_SCHEMAS`
2. inject `action` into args
3. instantiate model
4. return `(True, None)` on success
5. return `(False, message)` on unknown action or validation error

## Important Validators

`BrowserClickArgs`:

- requires `ref/index` or both coordinates
- rejects single-coordinate payloads

`BrowserInputArgs`, `BrowserDropdownOptionsArgs`, `BrowserSelectDropdownArgs`, `BrowserUploadFileArgs`:

- require `ref` or `index`

`BrowserEvaluateArgs`:

- requires canonical `code`

Additional bounds:

- snapshot paging limits
- extract query and offset bounds
- scroll amount/pages bounds
- input/evaluate length bounds

## Runtime Boundary with `browser_tool.py`

`browser_tool.execute_browser(...)` validates through `BrowserControlArgs` before adapter dispatch.

Runtime boundary layers:

1. action allowlist in `browser_tool.py`
2. strict grouped schema validation in `browser_tool.py`
3. adapter parameter mapping in `browser_adapter.py`
4. runtime provider execution constraints

So schema acceptance means "canonical grouped browser payload"; execution can still fail for runtime reasons.

## Backend vs Sidecar Validation Split

There is no browser-specific backend/sidecar schema split anymore.

Practical rule:

- frontend/sidecar code must never import backend code or rely on `backend.src.*`
- browser schema parity is maintained by keeping backend and sidecar wrappers aligned around the same contract shape without violating that boundary
- the production safeguard against drift is backend-vs-sidecar schema parity testing before release, not direct frontend imports of backend modules

## Test-Backed Coverage

`tests/sidecar/tools/test_browser_schemas.py` verifies:

- strict grouped contract parity with backend wrappers
- canonical-only action set
- strict field validation and helper lookup behavior
- sidecar browser schema modules do not import the backend package

Operational expectation:

- if a browser field/action changes, update both sides and rerun parity coverage before shipping
- do not bypass drift by making sidecar runtime imports reach into backend packages

## Related Pages

- [Frontend Sidecar Browser Contracts Docs Hub](README.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)
