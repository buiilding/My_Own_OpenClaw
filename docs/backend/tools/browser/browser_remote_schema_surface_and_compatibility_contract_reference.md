---
summary: "Deep backend browser-tool reference for BrowserControlArgs action categories, OpenClaw compatibility-field surfaces, and removed-alias runtime semantics."
read_when:
  - When changing backend browser action literal sets, removed-alias policy, or remote browser tool runtime gates.
  - When debugging backend-accepted browser payloads that are rejected as removed aliases before sidecar execution.
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

Action categories:

- canonical actions: `connect`, `status`, `profiles`, `navigate`, `snapshot`, `extract`, `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`, `get_tabs`, `switch`, `evaluate`, `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`, `close`
- removed aliases (still parseable for migration errors): `type`, `open`, `switch_tab`, `press`, `act`

`BrowserOpenClawAction` intentionally excludes removed aliases.

## Unified Schema Exposed to Tool Calling

`BrowserControlArgs` (`browser_control_args_schema.py`) is the LLM-facing backend schema.

Design characteristics:

- single unified model with `action: BrowserAction`
- `model_config.extra = "ignore"`
- broad field superset across canonical and compatibility action families
- includes compatibility aliases (`targetId`, `targetUrl`, `snapshotFormat`, `inputRef`, etc.)

Compatibility field layers:

- inherits `BrowserSharedCompatFields` (dialog/network/storage/emulation alias groups)
- inherits `BrowserScreenshotImageFields` (`element`, `type`, `quality`)
- reuses snapshot scope aliases from `snapshot_scope_fields.py` (`refs`, `interactive`, `compact`, `depth`, `selector`, `frame`)

Important boundary:

- unified model intentionally accepts broad payloads
- action-specific strictness is enforced later in sidecar adapter/runtime boundaries

## Action-Specific Validator Models

`schemas.py` contains stricter per-action models.

Examples:

- `BrowserClickArgs` requires either `ref/index` or coordinate pair
- `BrowserEvaluateArgs` requires `script` or `code`
- `BrowserSnapshotArgs` validates paging and snapshot mode/format bounds

## OpenClaw Compatibility Model

`BrowserOpenClawCompatArgs` in `openclaw_compat_schema.py` keeps compatibility action and field vocabulary with `extra="ignore"`.

It exists for compatibility modeling and tests while `RemoteBrowserTool` accepts unified `BrowserControlArgs`.

## RemoteBrowserTool Runtime Semantics

`RemoteBrowserTool` (`remote_tools/browser.py`) traits:

- `name = "browser"`
- `args_model = BrowserControlArgs`
- `category = ToolDomain.BROWSER`
- description includes canonical actions, removed-alias policy, and migration guidance

`execute_remote(...)` behavior:

1. removed aliases (`type`, `open`, `switch_tab`, `press`, `act`) are rejected immediately with migration errors
2. removed-alias blocks emit structured warning metadata:
- `legacy_action`
- `preferred_action`
- `legacy_action_blocked`
- `legacy_action_gate`
3. accepted payloads return `RemoteToolResult` with:
- `tool_name = "browser"`
- `args = args.model_dump(exclude_defaults=True, exclude_none=True)`

## Backend vs Runtime Enforcement Boundary

Backend schema acceptance is broader than sidecar runtime acceptance.

Implication:

- payload can parse under backend model but still fail at sidecar adapter/runtime boundaries

Cross-layer debugging rule:

1. validate backend parse (`BrowserControlArgs`)
2. inspect backend runtime alias-gate decision (removed alias)
3. inspect sidecar adapter/runtime normalization if request was forwarded

## Test-Backed Contracts

`tests/backend/test_browser_remote_tool.py` covers:

- browser tool registration and lookup behavior
- remote payload emission semantics
- unified schema defaults/aliases
- canonical + compatibility action parsing coverage
- removed-alias policy behavior
- OpenClaw compatibility model availability

## Related Docs

- [Browser Schema Docs Hub](schema/README.md)
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](schema/browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Sidecar Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](../../../frontend/sidecar/browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Sidecar Browser Adapter Action Routing and Compatibility Semantics Reference](../../../frontend/sidecar/browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Detailed Browser Action Compatibility and Runtime Reference](../../../frontend/sidecar/browser_action_compatibility_and_runtime_reference.md)
