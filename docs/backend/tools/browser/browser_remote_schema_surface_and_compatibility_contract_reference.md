---
summary: "Deep backend browser-tool reference for the strict grouped browser action catalog, model-facing root-object schema emission, and canonical runtime payload semantics."
read_when:
  - When changing backend browser action literals, grouped browser schema emission, or remote browser payload validation.
  - When debugging why a browser payload is rejected before sidecar execution.
title: "Browser Remote Schema Surface Reference"
---

# Browser Remote Schema Surface and Compatibility Contract Reference

This page documents the canonical backend browser contract in:

- `backend/src/tools/browser/*`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_browser_remote_tool.py`

## Module Export Boundary

`backend/src/tools/browser/__init__.py` exports:

- `BrowserControlArgs`
- lazy `RemoteBrowserTool` via `__getattr__`

Purpose of lazy export:

- avoid eager remote-tool imports and circular import pressure

## Browser Action Surface

`schema_types.py` defines the canonical grouped browser actions:

- `connect`, `status`, `profiles`, `navigate`, `snapshot`, `extract`, `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`, `get_tabs`, `switch`, `evaluate`, `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`, `close`

There are no removed-alias actions or compatibility-only browser fields in the backend contract anymore.

## Canonical Schema Source

`browser_control_args_schema.py` is the backend wrapper around the shared browser contract authority.

The shared contract module defines:

- one strict Pydantic model per action (`extra="forbid"`)
- one `BrowserActionContract` catalog with action name, args model, runtime action, and connection requirement
- one discriminated `BrowserControlArgs` union for grouped validation
- one `build_browser_tool_parameters_schema()` helper for model-facing schema emission

Important boundary:

- backend validation and model-facing schema emission derive from the same action catalog
- sidecar validation imports the same shared contract module instead of importing backend code

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
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](schema/browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Sidecar Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](../../../frontend/sidecar/browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Sidecar Browser Adapter Action Routing Reference](../../../frontend/sidecar/browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
