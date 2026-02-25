---
summary: "Deep reference for sidecar browser schema registry behavior: action-model mapping, validation helpers, and boundary split between schema validation, alias policy gates, and adapter/runtime enforcement."
read_when:
  - When adding/removing browser actions in sidecar schemas or changing sidecar action validation rules.
  - When debugging schema parse errors vs runtime alias-policy rejections in browser tool execution.
title: "Schema Registry and Action Validation Boundary Reference"
---

# Schema Registry and Action Validation Boundary Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `tests/sidecar/tools/test_browser_schemas.py`

## Schema Model Topology

`schemas.py` defines per-action Pydantic models and exposes:

- `BrowserControlArgs` union
- `BROWSER_SCHEMAS` registry
- `get_browser_schema(action)` helper
- `validate_browser_args(action, args)` helper

Model policy:

- each model uses `model_config.extra = "ignore"`
- required fields and model validators enforce action-level constraints

## Action Registry Contract (`BROWSER_SCHEMAS`)

Registry includes explicit entries for:

- `connect`, `navigate`, `snapshot`, `extract`, `click`, `type`, `scroll`, `screenshot`, `wait`, `get_tabs`, `evaluate`, `close`

Compatibility actions are injected from `OPENCLAW_COMPAT_ACTIONS` and map to `BrowserOpenClawCompatArgs`.

Important scope note:

- removed aliases (`open`, `switch_tab`, `press`, `act`) are not in sidecar schema action sets and are rejected by browser-tool alias policy.

## Validation Entry Point Behavior

`validate_browser_args(action, args)` flow:

1. resolve schema from `BROWSER_SCHEMAS`
2. inject `action` into args
3. instantiate model
4. return `(True, None)` on success
5. return `(False, message)` on unknown action or validation error

## Important Validators

`BrowserConnectArgs`:

- `cdp_url` must resolve to localhost/127.0.0.1 in user-chrome mode

`BrowserClickArgs`:

- requires `ref/index` or both coordinates
- rejects single-coordinate payloads

`BrowserEvaluateArgs`:

- requires `script` or `code`

Additional bounds:

- snapshot paging limits
- extract query/mode bounds
- scroll amount/pages bounds
- type/evaluate length bounds

## Runtime Boundary with `browser_tool.py`

`browser_tool.execute_browser(...)` does not rely solely on `validate_browser_args`.

Runtime boundary layers:

1. action allowlist + alias policy gates in `browser_tool.py`
2. adapter normalization/rejection rules in `browser_adapter.py`
3. runtime provider execution constraints

So schema acceptance means only "known shape", not guaranteed execution.

## Backend vs Sidecar Validation Split

- backend `BrowserControlArgs` is broad and transport-oriented
- sidecar schemas + tool/adapter policy are execution gates

Practical rule:

- backend acceptance does not imply sidecar acceptance

## Test-Backed Coverage

`tests/sidecar/tools/test_browser_schemas.py` verifies:

- localhost connect restriction
- snapshot/extract/click/scroll/evaluate constraints
- compatibility actions remain wired
- schema helper lookup/validation behavior

`tests/sidecar/tools/test_browser_use_tool_parity.py` adds Browser Use parity assertions.

## Related Pages

- [Frontend Sidecar Browser Contracts Docs Hub](README.md)
- [OpenClaw Compatibility Action and Field Surface Reference](openclaw_compat_action_and_field_surface_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)
