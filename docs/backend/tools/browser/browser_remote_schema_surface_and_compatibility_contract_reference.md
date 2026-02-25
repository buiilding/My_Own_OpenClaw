---
summary: "Deep backend browser-tool reference for unified BrowserControlArgs schema design, action-specific validator models, OpenClaw compatibility fields, and RemoteBrowserTool payload emission semantics."
read_when:
  - When changing backend browser action field names, compatibility aliases, or literal action sets.
  - When debugging cases where backend schema accepts fields that sidecar adapter later rejects at runtime.
title: "Browser Remote Schema Surface and Compatibility Contract Reference"
---

# Browser Remote Schema Surface and Compatibility Contract Reference

This page documents backend browser tool contracts in:

- `backend/src/tools/browser/*`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_browser_remote_tool.py`

## Module Export Boundary

`backend/src/tools/browser/__init__.py` exports:

- `BrowserControlArgs`
- lazy `RemoteBrowserTool` via `__getattr__`

Purpose of lazy export:

- avoid eager remote-tool imports and circular import pressure

## Browser Action Literal Surface

`schema_types.py` defines shared literal aliases used by schemas:

- navigation states (`load`, `domcontentloaded`, `networkidle`, `commit`)
- snapshot formats (`ai`, `aria`)
- mouse buttons (`left`, `right`, `middle`)
- scroll directions (`up`, `down`, `left`, `right`)
- wait states (`load`, `domcontentloaded`, `networkidle`)
- action union:
  - core actions (`connect`, `navigate`, `snapshot`, `extract`, `click`, `type`, `press`, `scroll`, `screenshot`, `wait`, `get_tabs`, `switch_tab`, `evaluate`, `close`)
  - OpenClaw-compatible actions (`status`, `profiles`, `open`, `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `input`, `send_keys`, `switch`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`, `act`)

## Unified Schema Exposed to Tool Calling

`BrowserControlArgs` (`browser_control_args_schema.py`) is the main LLM-facing schema.

Design characteristics:

- single unified model with `action: BrowserAction`
- `model_config.extra = "ignore"`
- broad field superset across multiple action families
- includes many compatibility aliases (`targetId`, `targetUrl`, `snapshotFormat`, `inputRef`, etc.)

Compatibility field layers:

- inherits from `BrowserSharedCompatFields` (dialog/network/storage/emulation aliases)
- reuses `BrowserScreenshotImageFields` for shared screenshot image options (`element`, `type`, `quality`)
- reuses snapshot scope aliases from `snapshot_scope_fields.py` (`refs`, `interactive`, `compact`, `depth`, `selector`, `frame`)

Important boundary:

- unified model intentionally accepts many optional fields
- it does not enforce strict action-specific required-field validation at this layer

## Action-Specific Validator Models

`schemas.py` contains per-action models that express stricter validation behavior.

Examples:

- `BrowserClickArgs` requires either `ref/index` or coordinate pair
- `BrowserEvaluateArgs` requires `script` or `code`
- `BrowserSnapshotArgs` has snapshot paging bounds and mode/format parameters

Backend test coverage validates these models remain usable (`BrowserSnapshotArgs` scope fields and `BrowserOpenClawCompatArgs` availability).

## OpenClaw Compatibility Model

`BrowserOpenClawCompatArgs` in `openclaw_compat_schema.py` defines compatibility payload fields with `extra="ignore"`.

It exists to preserve compatibility action/field vocabulary and aliases while backend primarily exposes `BrowserControlArgs` on `RemoteBrowserTool`.

## RemoteBrowserTool Emission Semantics

`RemoteBrowserTool` (`remote_tools/browser.py`) traits:

- `name = "browser"`
- `args_model = BrowserControlArgs`
- `category = ToolDomain.BROWSER`
- long description documents supported action semantics and runtime notes

`execute_remote(...)` behavior:

- request id from `RemoteToolBase._get_request_id(ctx)`
- returns `RemoteToolResult` with:
  - `tool_name = "browser"`
  - `args = args.model_dump(exclude_defaults=True, exclude_none=True)`

Key difference from most other remote tools:

- browser tool drops default/None fields before sending payload to frontend, reducing envelope size and ambiguity

## Backend vs Runtime Enforcement Boundary

Backend schema acceptance is intentionally wider than sidecar runtime acceptance.

Implication:

- payload can be valid under backend model but still rejected by sidecar adapter/runtime normalization

Examples noted in runtime docs include compatibility fields explicitly rejected for certain actions.

Cross-layer debugging rule:

1. validate backend schema parse success (`BrowserControlArgs`)
2. validate sidecar adapter/runtime action normalization rules
3. verify final action payload emitted over `tool-call` event

## Test-Backed Contracts

`tests/backend/test_browser_remote_tool.py` covers:

- browser tool registration in `REMOTE_TOOLS`
- `get_remote_tool("browser")` lookup behavior
- basic remote result emission semantics
- unified schema field defaults and accepted aliases
- action examples (`connect`, `navigate`, `search`, `extract`, `click`, `type`, `press`, `screenshot`, `scroll`)
- snapshot scope field acceptance on unified and action-specific models
- OpenClaw compatibility model availability

## Related Docs

- [Browser Schema Docs Hub](schema/README.md)
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](schema/browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Sidecar Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](../../../frontend/sidecar/browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Sidecar Browser Adapter Action Routing and Compatibility Semantics Reference](../../../frontend/sidecar/browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Detailed Browser Action Compatibility and Runtime Reference](../../../frontend/sidecar/browser_action_compatibility_and_runtime_reference.md)
