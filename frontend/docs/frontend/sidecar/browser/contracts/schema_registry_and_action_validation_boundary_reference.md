---
summary: "Deep reference for local-runtime browser grouped-schema validation behavior under the shared strict browser contract module."
read_when:
  - When adding/removing browser actions or changing local-runtime browser validation rules.
  - When debugging schema parse errors before adapter/runtime execution.
title: "Grouped Schema and Action Validation Boundary Reference"
---

# Grouped Schema and Action Validation Boundary Reference

## Canonical Modules

- `frontend/src/main/python/windie_shared/browser_contract*.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `tests/sidecar/tools/test_browser_schemas.py`

## Schema Model Topology

`frontend/src/main/python/windie_shared/browser_contract.py` exposes the browser
contract consumed directly by the local-runtime browser adapter and backend remote browser tool:

- `BrowserControlArgs` discriminated grouped union
- `BROWSER_ACTION_CONTRACTS` action catalog used for model-facing schema projection

Model policy:

- each action model uses `model_config.extra = "forbid"`
- required fields and model validators enforce action-level constraints

## Action Catalog Contract

`BROWSER_ACTION_CONTRACTS` includes explicit entries for:

- the full canonical grouped browser action set

Removed aliases and compatibility-only fields are absent from the grouped union entirely.

## Validation Entry Point Behavior

`BrowserControlArgs.model_validate(args)` flow:

1. read `args.action`
2. select the discriminated action model
3. instantiate the strict model
4. return the grouped args object on success
5. raise `ValidationError` on unknown action or validation error

## Important Validators

`BrowserClickArgs`:

- requires `index` or both coordinates
- rejects single-coordinate payloads

`BrowserInputArgs`, `BrowserSelectDropdownArgs`, `BrowserUploadFileArgs`,
`BrowserHoverArgs`, and deterministic `BrowserGet*Args`:

- require `index`

`BrowserEvaluateArgs`:

- requires canonical `code`

Additional bounds:

- snapshot paging limits
- extract query and offset bounds
- scroll amount/pages bounds
- input/evaluate length bounds

## Runtime Boundary with `browser_tool.py`

`browser_tool.execute_browser(...)` validates through `BrowserControlArgs` before Browser Use engine dispatch.

Runtime boundary layers:

1. action allowlist in `browser_tool.py`
2. strict grouped schema validation in `browser_tool.py`
3. Browser Use engine parameter mapping in `browser_use_engine.py`
4. runtime provider execution constraints

So schema acceptance means "canonical grouped browser payload"; execution can still fail for runtime reasons.

## Backend vs Local-Runtime Validation Alignment

There is no browser-specific backend/local-runtime schema split anymore.

Practical rule:

- client/local-runtime Python code must never import backend code or rely on `backend.src.*`
- browser schema parity is maintained by keeping backend remote-tool loading and
  local-runtime validation aligned around the shared contract without violating that boundary
- the production safeguard against drift is backend-vs-local-runtime schema parity testing before release, not direct frontend imports of backend modules

## Test-Backed Coverage

`tests/sidecar/tools/test_browser_schemas.py` verifies:

- strict grouped contract parity with backend remote-tool validation
- canonical-only action set
- strict field validation through `BrowserControlArgs`
- local-runtime browser implementation modules do not import the backend package

Operational expectation:

- if a browser field/action changes, update both sides and rerun parity coverage before shipping
- do not bypass drift by making local-runtime Python imports reach into backend packages

## Related Pages

- [Local-Runtime Browser Contracts Docs Hub](README.md)
- [Browser Action Runtime Reference](../../browser_action_runtime_reference.md)
