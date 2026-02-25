---
summary: "Detailed browser tool action reference: OpenClaw compatibility surface, adapter normalization rules, native Browser Use handler routing, and error/timeout semantics across renderer-main-sidecar."
read_when:
  - When changing browser action payload fields, action names, or adapter normalization logic.
  - When debugging browser action failures caused by runtime selection, connection state, invalid argument mapping, or timeout boundaries.
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
- Browser actions are routed through adapter/runtime path only when `action` is in `PHASE2_ADAPTER_ROUTED_ACTIONS`.
- Sidecar runtime enforces vendored Browser Use import path; non-vendored `browser_use*` modules are purged from `sys.modules`.
- Runtime selection accepts only `WINDIE_BROWSER_USE_RUNTIME in {"browser_use","browser_use_native"}`. Unset defaults to `browser_use_native`.
- Optional strict action mode: `WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1` rejects legacy aliases (`open`, `type`, `press`, `switch_tab`, `act`) and requires canonical action names.
- Optional rollout flag: `WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=0` also rejects legacy aliases (default allows them).
- Precedence: strict mode wins when both flags are set (`WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1` overrides `WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1`).
- Observability: when legacy aliases are still allowed, sidecar logs a warning with legacy and preferred canonical action names.
- `connect` always targets WindieOS dedicated localhost CDP browser endpoint; external hosts are rejected.

## End-to-End Action Path

1. Renderer sends `INVOKE_CHANNELS.EXECUTE_TOOL`.
2. Electron main `ipcMain.handle("execute-tool")` calls sidecar JSON-RPC `execute_tool`.
3. Browser tool gets extended timeout: `120000ms` (`30000ms` for non-browser tools).
4. Sidecar `LocalBackend._handle_execute_tool` delegates to `ToolRegistry.execute_tool("browser", args)`.
5. `browser_tool.execute_browser` gates action + invokes `BrowserUseCompatibilityAdapter.execute`.
6. Adapter normalizes/validates args, then calls runtime provider (`BrowserUseNativeRuntimeProvider`) handlers.

## Action Families and Routing

### Adapter-owned compatibility actions

Actions with custom adapter handlers:

- with args: `connect`, `open`, `type`, `press`, `switch_tab`, `act`
- no args: `status`, `profiles`, `get_tabs`

Canonical-action recommendation:

- Prefer canonical actions directly in model/tool prompts:
  - `navigate`, `input`, `send_keys`, `switch`
- Keep legacy aliases only for backward compatibility and migration windows.

Adapter behavior includes compatibility transforms:

- `open` -> runtime `navigate` with `new_tab=true`
- `type` -> runtime `input` (+ optional `send_keys` Enter when `submit=true`)
- `press` -> runtime `send_keys`
- `switch_tab` -> runtime `switch`

### Browser Use passthrough actions

`BROWSER_USE_PASSTHROUGH_ACTIONS` includes direct runtime bridge actions:

- `navigate`, `snapshot`, `extract`, `click`, `scroll`, `screenshot`, `wait`, `evaluate`
- plus direct set: `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `input`, `send_keys`, `switch`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`

### Close semantics split

- `close` with `tab_id`/`target_id` -> runtime close-tab action.
- `close` without tab identity -> adapter closes full runtime session (`_runtime.close()`).

## Connection Gates and Session Behavior

Actions in `BROWSER_USE_ACTIONS_REQUIRING_CONNECTION` hard-fail with:

- `error_code="BROWSER_NOT_CONNECTED"`
- message: `Browser not connected. Run 'connect' action first.`

Runtime bridge session mode derives from controller internals:

- mode `user_chrome` -> Browser Use `BrowserSession(cdp_url=...)`
- mode `managed` -> Browser Use local session `BrowserSession(is_local=True, headless=False)`

If controller disconnects or mode becomes ambiguous, bridge drops/restarts session and returns runtime error.

## Parameter Normalization Rules

## `snapshot`

- Compatibility snapshot fields are explicitly rejected (`format`, `snapshotFormat`, `wait_until`, `state`, `mode`, `max_chars`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`).
- Only native Browser Use snapshot params accepted by adapter path:
  - `offset` (default `0`, non-negative int)
  - `limit` (default `4000`, positive int)
  - `include_screenshot` (bool)
- Window bound is enforced: `offset + limit <= 120000`.

## `extract`

- Rejects compatibility fields `mode`, `selector`, `frame`.
- Requires non-empty `query`.
- Optional supported pass-through: `extract_links`, `start_from_char`, `output_schema`.

## `click`

- Accepts any one of:
  - `index` (int >= 0)
  - `ref` numeric string (mapped to index)
  - coordinate pair `coordinate_x` + `coordinate_y`
- Rejects half-specified coordinate payloads.

## Tab identity normalization

- Adapter accepts `tab_id`, `target_id`, `targetId`.
- Runtime-facing tab IDs are truncated to the last 4 chars in extraction helpers, matching controller/tab serialization behavior.

## `act` wrapper behavior

`act.request.kind` fan-out:

- `click`, `type`, `press`, `wait`, `evaluate` -> mapped to adapter-native handlers
- `navigate`, `extract`, `scroll`, `screenshot` -> forwarded through `execute`
- Browser Use direct kinds (`done`, `search`, etc.) -> direct runtime action bridge
- Unsupported kinds return `ACTION_UNSUPPORTED`.

## Native Runtime Handler Model

`BrowserUseNativeRuntimeProvider` loads handlers from:

- env `WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE`
- default module `tools.browser.browser_runtime`
- required export: `get_native_runtime_handlers`

Core native handler map includes:

- custom handlers: `wait_seconds`, `snapshot`, `status`, `get_tabs`
- direct Browser Use action handlers for each `_BROWSER_USE_ACTIONS` action
- alias: `close_tab` -> Browser Use `close`

## Native Sources in Responses

Key `native_source` values identify execution layer:

- `browser_use.tools` for Browser Use tool registry actions
- `browser_use.state` for status/get_tabs/snapshot state summaries
- `windie.timer` for timed wait fallback when browser wait path fails

## Extraction LLM Resolution

Browser Use extract/read-long-content actions require page extraction LLM.

Resolution order:

1. `WINDIE_BROWSER_USE_EXTRACTION_MODEL`
2. Windie extraction override envs:
  - `WINDIE_BROWSER_USE_EXTRACTION_PROVIDER`
  - `WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID`
  - optional key/url override envs
3. Windie runtime config fallback (`backend.src.core.config.loader.load_settings_from_file`)

Unsupported provider mapping yields explicit runtime error with provider name.

## Error and Timeout Surface

## Main-process timeout boundaries

- `execute-tool` browser: `120000ms`
- `execute-tool` others: `30000ms`
- generic bridge requests default: `30000ms`

## Adapter error code mapping

- `INVALID_ARGUMENT`: payload validation/compat mismatch
- `BROWSER_NOT_CONNECTED`: action requires connected browser session
- `ACTION_UNSUPPORTED`: unknown action or unsupported `act.kind`
- `BROWSER_RUNTIME_ERROR`: runtime execution failure / unavailable runtime

`browser_tool` converts adapter result to `ToolResult`:

- success -> `ToolResult.success_result(data)` and includes legacy observability fields when adapter reports legacy alias usage:
  - `warnings`
  - `deprecation`
  - `legacy_action`
  - `preferred_action`
- error/deprecation -> `ToolResult.error_result(message)`

## Contract Drift Note

`tools/browser/schemas.py` still defines compatibility fields for several actions (`snapshot`, `extract`, `screenshot`, `wait`), while adapter runtime rejects specific compatibility keys for strict Browser Use semantics. This is intentional migration behavior and can surface as validation pass + adapter rejection.

## Debug Checklist

If browser action fails unexpectedly:

1. verify `action` is listed in `PHASE2_ADAPTER_ROUTED_ACTIONS`
2. inspect adapter normalization path in `_build_browser_use_action_params`
3. confirm runtime provider selected and vendored `browser_use` import resolved
4. verify connection state before connection-required actions
5. check timeout boundary (main bridge 120s for browser tool) vs actual runtime latency
6. inspect `error_code` and `native_source` for failure layer attribution

## Related Pages

- [Sidecar Browser Docs Hub](browser/README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
