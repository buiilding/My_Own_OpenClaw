---
summary: "Deep reference for backend BrowserControlArgs schema layering: strict per-action models, grouped discriminated validation, and canonical browser field sets."
read_when:
  - When adding/removing browser actions or changing canonical browser fields in backend schemas.
  - When debugging why a browser payload fails grouped validation.
title: "Browser Control Unified Schema Reference"
---

# Browser Control Unified Schema and Compatibility Field Matrix Reference

## Canonical Modules

- `frontend/src/main/python/windie_shared/browser_contract.py`
- `backend/src/tools/browser/schema_types.py`
- `backend/src/tools/browser/browser_control_args_schema.py`
- `backend/src/tools/browser/schemas.py`

## Layer 1: Literal Type Surface (`schema_types.py`)

Reusable literals define browser vocabulary and field enums:

- navigation state: `load | domcontentloaded | networkidle | commit`
- mouse button: `left | right | middle`
- scroll direction: `up | down | left | right`
- wait state: `load | domcontentloaded | networkidle`

Action categories:

- `BrowserCanonicalAction`: canonical runtime actions
- `BROWSER_CANONICAL_ACTIONS`: tuple projection of the canonical action set

## Layer 2: Strict Action Models

The shared browser contract module defines one strict model per action with `extra="forbid"`.

Examples:

- `BrowserSnapshotArgs`: `offset`, `limit`, `include_screenshot`
- `BrowserExtractArgs`: `query`, `extract_links`, `start_from_char`, `output_schema`
- `BrowserInputArgs`: `ref/index`, `text`, `clear`, `submit`
- `BrowserSwitchArgs`: `tab_id`
- `BrowserEvaluateArgs`: `code`

There are no compatibility-only browser fields left in any action model.

## Layer 3: Grouped Backend Schema (`BrowserControlArgs`)

`BrowserControlArgs` is the backend-exposed browser tool args model.

Key characteristics:

- discriminated `RootModel` over the canonical action models
- action discriminator is `arguments.action`
- invalid or cross-action fields fail immediately during validation

## Layer 4: Action Catalog

`BROWSER_ACTION_CONTRACTS` is the single browser authority used by backend and sidecar.

Each catalog entry defines:

- action name
- strict args model
- Browser Use runtime action name
- whether the action requires an active browser connection
- whether the action is model-visible

Derived helpers include:

- `BROWSER_SCHEMAS`
- `BROWSER_RUNTIME_ACTIONS`
- `BROWSER_ACTIONS_REQUIRING_CONNECTION`
- `build_browser_tool_parameters_schema()`

## Remote Payload Implication

`RemoteBrowserTool.execute_remote(...)` serializes args with:

- `args.model_dump(exclude_defaults=True, exclude_none=True)`

Consequences:

- defaults/`None` values are omitted from transport payloads
- sidecar receives only canonical per-action fields

## Model-Facing Projection Nuance

`build_browser_tool_parameters_schema()` emits:

- top-level grouped `browser` parameters object
- `action` enum covering the canonical browser action set
- one `oneOf` branch per action with only that action’s fields

No branch includes removed alias fields or compatibility-only fields.

## Test-Backed Anchors

`tests/backend/test_browser_remote_tool.py` asserts:

- `RemoteBrowserTool.args_model == BrowserControlArgs`
- grouped `oneOf` schema matches the action catalog
- model-facing action enum is exactly the canonical action set
- removed fields such as `mode`, `format`, `target_id`, `input_ref`, `clear_first`, and `script` are absent
- removed actions such as `open`, `type`, `press`, and `switch_tab` fail validation

## Related Pages

- [Backend Browser Schema Docs Hub](README.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser_remote_schema_surface_and_compatibility_contract_reference.md)
