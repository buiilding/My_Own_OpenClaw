---
summary: "Detailed browser tool action reference: canonical vs removed alias policy, adapter/runtime routing, and error/timeout semantics across renderer-main-sidecar."
read_when:
  - When changing browser action payload fields, action names, alias policy, or adapter normalization logic.
  - When debugging browser action failures caused by runtime selection, connection state, removed-alias blocks, or timeout boundaries.
title: "Browser Action Compatibility and Runtime Reference"
---

# Browser Action Compatibility and Runtime Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_adapter.py`
- `frontend/src/main/python/tools/browser/browser_runtime.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/controller.py`

## Runtime Invariants

- Browser tool entrypoint accepts only object args and requires `action`.
- Browser actions route through adapter/runtime only when action is in `BROWSER_ROUTED_ACTIONS`.
- Browser controller factory is resolved lazily via `browser_tool.get_browser_controller()` (module import no longer requires Playwright unless controller execution is requested).
- Runtime selection accepts only `WINDIE_BROWSER_USE_RUNTIME in {"browser_use","browser_use_native"}`; unset defaults to `browser_use_native`.
- Removed aliases (always blocked): `type`, `open`, `switch_tab`, `press`, `act`.
- Structured warning fields: `legacy_action`, `preferred_action`, `legacy_action_blocked`, `legacy_action_gate`.
- `connect` always targets WindieOS dedicated localhost CDP endpoint.

## End-to-End Action Path

1. Renderer invokes `INVOKE_CHANNELS.EXECUTE_TOOL`.
2. Electron main forwards JSON-RPC `execute_tool`.
3. Browser tool has extended timeout (`120000ms`; non-browser tools `60000ms`).
4. Sidecar `LocalBackend._handle_execute_tool` calls `ToolRegistry.execute_tool("browser", args)`.
5. `browser_tool.execute_browser` applies removed-alias gate, then invokes adapter.
6. Adapter normalizes and dispatches to runtime provider handlers.

## Action Families and Routing

### Adapter-owned compatibility actions

- explicit compat handlers: `connect`, `profiles`
- removed aliases return migration errors directly

### Canonical runtime passthrough actions

- `navigate`, `snapshot`, `extract`, `click`, `scroll`, `screenshot`, `wait`, `evaluate`
- `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `input`, `send_keys`, `switch`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`
- `status`, `get_tabs` run through runtime execute path and report state payloads

### Close semantics split

- `close` with tab identity -> runtime close-tab action
- `close` without tab identity -> closes full runtime session

## Connection Gates and Session Behavior

Actions in `BROWSER_USE_ACTIONS_REQUIRING_CONNECTION` hard-fail when disconnected:

- `error_code="BROWSER_NOT_CONNECTED"`
- message: `Browser not connected. Run 'connect' action first.`

Runtime session mode:

- `user_chrome` -> Browser Use `BrowserSession(cdp_url=...)`
- `managed` -> Browser Use local session `BrowserSession(is_local=True, headless=False)`

## Parameter Normalization Rules

### `snapshot`

Rejected compatibility fields:

- `format`, `snapshotFormat`, `wait_until`, `state`, `mode`, `max_chars`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`

Accepted adapter params:

- `offset` (default `0`)
- `limit` (default `4000`)
- `include_screenshot` (bool)

Bound:

- `offset + limit <= 120000`

### `extract`

- rejects `mode`, `selector`, `frame`
- requires non-empty `query`
- supports optional `extract_links`, `start_from_char`, `output_schema`

### `click`

- accepts `index`, numeric `ref`, or coordinate pair (`coordinate_x` + `coordinate_y`)
- rejects half-specified coordinate payloads

### Tab identity normalization

- accepts `tab_id`, `target_id`, `targetId`
- runtime-facing tab IDs are normalized to trailing 4 chars

## Removed Aliases (`type`, `open`, `switch_tab`, `press`, `act`)

- blocked at browser tool boundary with migration error
- also blocked in adapter for direct adapter-call paths
- no runtime env flags re-enable removed aliases

## Native Runtime Handler Model

`BrowserUseNativeRuntimeProvider` loads handlers from:

- env `WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE`
- default module `tools.browser.browser_runtime`
- required export: `get_native_runtime_handlers`

Core native handler map includes:

- custom handlers: `wait_seconds`, `snapshot`, `status`, `get_tabs`
- direct Browser Use action handlers for runtime registry actions
- alias: `close_tab` -> Browser Use `close`

## Error and Timeout Surface

### Main-process timeout boundaries

- browser `execute-tool`: `120000ms`
- non-browser `execute-tool`: `60000ms`
- generic bridge default: `60000ms`

### Adapter error code mapping

- `INVALID_ARGUMENT`: payload validation/compat mismatch
- `BROWSER_NOT_CONNECTED`: action requires active connection
- `ACTION_UNSUPPORTED`: unknown action
- `BROWSER_RUNTIME_ERROR`: runtime execution/provider failure

`browser_tool` result conversion:

- adapter success -> `ToolResult.success_result(data)`
- adapter error -> `ToolResult.error_result(message)`
- removed-alias gate failures are returned as `ToolResult.error_result(...)` before adapter execution

## Debug Checklist

1. verify action category (canonical vs removed alias)
2. inspect browser tool removed-alias gate decision
3. inspect adapter normalization path (`_build_browser_use_action_params`)
4. verify connection state for connection-required actions
5. inspect runtime error code + `browser_use_action`
6. check timeout boundaries for long browser operations

## Related Pages

- [Sidecar Browser Docs Hub](browser/README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
