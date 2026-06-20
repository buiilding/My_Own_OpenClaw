---
summary: "Deep reference for backend BrowserControlArgs schema layering: strict per-action models, grouped discriminated validation, and canonical browser field sets."
read_when:
  - When adding/removing browser actions or changing canonical browser fields in backend schemas.
  - When debugging why a browser payload fails grouped validation.
title: "Browser Control Unified Schema Reference"
---

# Browser Control Unified Schema Reference

## Canonical Modules

- `frontend/src/main/python/windie_shared/browser_contract.py`
- `backend/src/tools/browser/shared_contract_loader.py`
- `backend/src/tools/remote_tools/browser.py`

## Layer 1: Literal Type Surface

The shared browser contract defines browser vocabulary and field enums. Backend
code loads that contract through `shared_contract_loader.py` and the remote
browser tool consumes it directly:

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
- `BrowserInputArgs`: `index`, `text`
- `BrowserSwitchArgs`: `tab_index`
- `BrowserEvaluateArgs`: `code`

There are no compatibility-only browser fields left in any action model.

## Layer 3: Grouped Backend Schema (`BrowserControlArgs`)

`BrowserControlArgs` is the backend-exposed browser tool args model.

Key characteristics:

- discriminated `RootModel` over the canonical action models
- action discriminator is `arguments.action`
- invalid or cross-action fields fail immediately during validation

## Layer 4: Action Catalog

`BROWSER_ACTION_CONTRACTS` is the single browser authority used by backend and local runtime.

Each catalog entry defines:

- action name
- strict args model

Derived schema projection uses:

- `BROWSER_ACTION_CONTRACTS`
- `build_browser_tool_parameters_schema()`

## Remote Payload Implication

`RemoteBrowserTool.execute_remote(...)` serializes args with:

- `args.model_dump(exclude_defaults=True, exclude_none=True)`

Consequences:

- defaults/`None` values are omitted from transport payloads
- local runtime receives only canonical per-action fields

## Model-Facing Projection Nuance

`build_browser_tool_parameters_schema()` emits:

- top-level grouped `browser` parameters object
- `action` enum covering the canonical browser action set
- required top-level `explanation` shared across canonical browser actions
- one root-object property set merged from the canonical action models
- no top-level schema combinators; action-specific field requirements stay enforced by runtime validation
- no hidden local-ref/composition cleanup path; action model schemas must stay
  flat and only nullable `anyOf` fields are normalized while building the grouped
  schema
- non-nullable `anyOf` shapes fail schema generation instead of being emitted to
  the model-facing browser tool

The root object includes no removed alias fields or compatibility-only fields.

## Test-Backed Anchors

`tests/backend/test_browser_remote_tool.py` asserts:

- `RemoteBrowserTool.args_model == BrowserControlArgs`
- grouped root-object schema matches the action catalog
- model-facing action enum is exactly the canonical action set
- removed fields such as `mode`, `format`, `target_id`, `input_ref`, `clear_first`, and `script` are absent
- removed actions such as `open`, `type`, `press`, and `switch_tab` fail validation

## Related Pages

- [Backend Browser Schema Docs Hub](README.md)
- [Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference](backend_local_runtime_browser_schema_parity_and_validation_boundary_reference.md)
- [Browser Remote Schema Surface Reference](../browser_remote_schema_surface_reference.md)
