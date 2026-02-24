---
summary: "Deep reference for sidecar browser schema registry behavior: action-to-model mapping, union coverage, validation entrypoints, and backend-vs-sidecar boundary semantics."
read_when:
  - When adding/removing browser actions in sidecar schema models or changing action validation rules.
  - When debugging schema parse errors from `validate_browser_args` or mismatches with adapter/runtime dispatch behavior.
title: "Schema Registry and Action Validation Boundary Reference"
---

# Schema Registry and Action Validation Boundary Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `tests/sidecar/tools/test_browser_schemas.py`

## Schema Model Topology

`schemas.py` defines per-action Pydantic models, then exposes:

- `BrowserControlArgs` union type
- `BROWSER_SCHEMAS` dictionary for runtime action lookup
- `get_browser_schema(action)` helper
- `validate_browser_args(action, args)` helper

Model policy:

- each action model uses `model_config.extra = "ignore"`
- strict requirements are implemented with field bounds and model validators

## Action Registry Contract (`BROWSER_SCHEMAS`)

Registry includes core actions:

- `connect`, `navigate`, `snapshot`, `extract`, `click`, `type`, `press`, `scroll`, `screenshot`, `wait`, `get_tabs`, `switch_tab`, `evaluate`, `close`

Compatibility actions are injected automatically:

- each action in `OPENCLAW_COMPAT_ACTIONS` maps to `BrowserOpenClawCompatArgs`

Implication:

- compatibility action expansion is centralized in openclaw schema definition
- registry coverage changes when compatibility action literal list changes

## Validation Entry Point Behavior

`validate_browser_args(action, args)` flow:

1. resolve model from `BROWSER_SCHEMAS`
2. inject `action` into supplied `args`
3. instantiate model
4. return `(True, None)` on success
5. return `(False, error_message)` on unknown action or validation error

No exception is propagated by helper; callers get normalized tuple response.

## Important Action-Level Validators

`BrowserConnectArgs`:

- `cdp_url` must be localhost/127.0.0.1 when connect mode targets user chrome

`BrowserClickArgs`:

- requires either `ref`/`index` or both `coordinate_x` + `coordinate_y`
- single coordinate without pair is rejected

`BrowserEvaluateArgs`:

- requires one of `script` or `code`

Additional strict bounds:

- snapshot `max_chars`/pagination limits
- extract `query` length and mode bounds
- scroll `amount`/`pages` bounds
- type/evaluate text-length bounds

## Runtime Boundary with `browser_tool.py`

`browser_tool.execute_browser(...)` does not directly call `validate_browser_args`; instead it:

- enforces known action membership (`PHASE2_ADAPTER_ROUTED_ACTIONS`)
- routes action to compatibility adapter/runtime provider

Therefore sidecar validation boundary has two layers:

1. schema-level constraints (when explicitly validated in callers/tests)
2. adapter/runtime normalization and execution constraints

## Backend vs Sidecar Validation Split

Backend `BrowserControlArgs` is broad and transport-oriented; sidecar action models are stricter for execution semantics.

Practical rule:

- backend acceptance does not imply sidecar action acceptance
- sidecar schema + adapter rules remain final gate before browser execution

## Test-Backed Coverage

`tests/sidecar/tools/test_browser_schemas.py` verifies:

- connect localhost-only restriction
- snapshot/extract/click/scroll/evaluate bound/validator behavior
- OpenClaw compatibility actions remain wired
- schema helper lookups and validations remain functional

`tests/sidecar/tools/test_browser_use_tool_parity.py` adds action parity checks against Browser Use registry.

## Related Pages

- [Frontend Sidecar Browser Contracts Docs Hub](README.md)
- [OpenClaw Compatibility Action and Field Surface Reference](openclaw_compat_action_and_field_surface_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)
