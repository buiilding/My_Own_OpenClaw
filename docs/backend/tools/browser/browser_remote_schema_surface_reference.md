---
summary: "Deep backend browser-tool reference for the strict grouped browser action catalog, model-facing root-object schema emission, and canonical runtime payload semantics."
read_when:
  - When changing backend browser action literals, grouped browser schema emission, or remote browser payload validation.
  - When debugging why a browser payload is rejected before local execution.
title: "Browser Remote Schema Surface Reference"
---

# Browser Remote Schema Surface Reference

This page documents the canonical backend browser contract in:

- `backend/src/tools/browser/*`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_browser_remote_tool.py`

## Browser Action Surface

`RemoteBrowserTool` loads the canonical grouped browser actions from the shared
browser contract via `shared_contract_loader.py`:

- `connect`, `status`, `profiles`, `navigate`, `snapshot`, `extract`, `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`, `get_tabs`, `switch`, `evaluate`, `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `close_tab`, `select_dropdown`, `upload_file`, `hover`, `save_as_pdf`, `get_text`, `get_value`, `get_attributes`, `get_bbox`, `write_file`, `replace_file`, `read_file`, `read_long_content`, `close`

There are no removed-alias actions or compatibility-only browser fields in the backend contract anymore.

## Canonical Schema Source

The shared browser contract is the browser schema authority. Backend code loads
it through `backend/src/tools/browser/shared_contract_loader.py`; there is no
separate backend schema re-export wrapper.

The shared contract module defines:

- one strict Pydantic model per action (`extra="forbid"`)
- one `BrowserActionContract` catalog with action name and args model
- one discriminated `BrowserControlArgs` union for grouped validation
- one `build_browser_tool_parameters_schema()` helper for model-facing schema emission
- flat action model JSON schemas only; nullable `anyOf` cleanup is the sole
  schema normalization step before property merging, and non-nullable `anyOf`
  shapes fail schema generation instead of being passed through
- implementation is split internally into action models, action catalog, and model-facing schema builder modules while keeping `windie_shared.browser_contract` as the stable import surface for backend and sidecar callers

Important boundary:

- backend validation and model-facing schema emission derive from the same action catalog
- Python sidecar validation imports the same shared contract module instead of importing backend code

## RemoteBrowserTool Runtime Semantics

`RemoteBrowserTool` (`remote_tools/browser.py`) traits:

- `name = "browser"`
- `args_model = BrowserControlArgs`
- `category = ToolDomain.BROWSER`
- description focuses on canonical action workflow

Model-facing declaration emission (`build_tool_spec(...)`):

- emits one grouped `browser` tool
- keeps top-level `action` enum for the full canonical action set
- emits one root object containing only canonical browser fields gathered from the action catalog
- rejects hidden local-ref/composition paths: action model schemas must not
  introduce `$defs`, `$ref`, `allOf`, or `oneOf`
- never advertises removed aliases or compatibility-only fields such as `mode`, `format`, `refs`, `interactive`, `compact`, `depth`, `frame`, `target_id`, `target_url`, `input_ref`, `clear_first`, or `script`
- keeps action-specific required-field enforcement in runtime discriminated-union validation instead of a top-level schema combinator

OpenAI transport compatibility:

- the canonical backend browser schema now emits an OpenAI-safe root object directly, so both chat-completions and Responses transports can forward it without browser-specific schema projection
- runtime browser validation still uses the canonical grouped discriminated union, so transport compatibility does not weaken backend/sidecar enforcement

`execute_remote(...)` behavior:

1. accepts only canonical grouped payloads that validate against `BrowserControlArgs`
2. serializes `args.model_dump(exclude_defaults=True, exclude_none=True)` to the sidecar
3. preserves only canonical per-action fields in the remote payload

## Backend vs Runtime Enforcement Boundary

Backend and sidecar now share the same grouped browser contract.

Practical rule:

1. if the backend accepts a browser payload, the sidecar schema layer accepts the same grouped action shape
2. adapter/runtime errors are operational failures, not compatibility-cleanup failures

## Test-Backed Contracts

`tests/backend/test_browser_remote_tool.py` covers:

- browser tool registration and lookup behavior
- model-facing grouped root-object schema emission
- canonical-only action enum and canonical field exposure
- strict grouped validation for removed fields and removed actions
- remote payload emission semantics for canonical grouped actions

## Related Docs

- [Browser Schema Docs Hub](schema/README.md)
- [Browser Control Unified Schema Reference](schema/browser_control_unified_schema_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Sidecar Browser Action Runtime Reference](../../../frontend/sidecar/browser_action_runtime_reference.md)
