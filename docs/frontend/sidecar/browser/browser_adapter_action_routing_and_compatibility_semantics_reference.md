---
summary: "Deep reference for BrowserUseCompatibilityAdapter action family routing, parameter normalization/rejection rules, connection gates, and ToolResult-facing error semantics."
read_when:
  - When changing browser action payload contracts in `browser_adapter.py` or `browser_tool.py`.
  - When debugging why compatibility payload fields pass schema validation but are rejected by adapter normalization.
title: "Browser Adapter Action Routing and Compatibility Semantics Reference"
---

# Browser Adapter Action Routing and Compatibility Semantics Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_adapter.py`
- `frontend/src/main/python/tools/browser/browser_action_contract.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`
- `tests/sidecar/tools/test_browser_tool.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`

## Entrypoint and Action Allowlist Boundary

`execute_browser(raw_args)` in `browser_tool.py`:

1. requires dict payload
2. requires `action`
3. gates action against `PHASE2_ADAPTER_ROUTED_ACTIONS`
4. obtains controller + compatibility adapter
5. runs `adapter.execute(action, args)`
6. maps adapter result to `ToolResult`

ToolResult mapping:

- adapter success -> `ToolResult.success_result(data)`
- adapter failure/deprecation -> `ToolResult.error_result(message)`

Unhandled action behavior:

- returns explicit `"Unhandled action: <action>"`

## Adapter Dispatch Topology

`BrowserUseCompatibilityAdapter.execute(...)` order:

1. explicit compat handlers:
   - `connect`
   - `profiles`
   - legacy aliases (`open`, `type`, `press`, `switch_tab`, `act`)
2. canonical actions dispatch directly through `execute_browser_use_action(...)`
3. `close` split behavior inside canonical dispatch:
   - with tab identity -> Browser Use `close` action
   - without tab identity -> runtime session close

Legacy alias annotation:

- compatibility aliases (`open`, `type`, `press`, `switch_tab`, `act`) are annotated with adapter `deprecation` + warning text
- routing behavior is unchanged; this is observability for migration

Unknown action returns:

- `success=False`
- `error_code="ACTION_UNSUPPORTED"`

## Connection Gate Semantics

Actions in `BROWSER_USE_ACTIONS_REQUIRING_CONNECTION` fail fast when disconnected:

- `error_code="BROWSER_NOT_CONNECTED"`
- error message instructs running `connect` first

Test-backed behavior:

- disconnected snapshot/find_text paths reject before runtime action execution

## Parameter Normalization and Rejection Rules

Core normalizers:

- `_extract_url` supports `url`, `target_url`, `targetUrl`
- `_extract_index` supports integer `index` or numeric string `ref`
- `_extract_tab_id` supports `tab_id` / `target_id` / `targetId` and truncates to trailing 4 chars
- `_extract_coordinate` accepts int/float (bool rejected)

### Compatibility field rejection (intentional strictness)

Adapter rejects legacy compatibility fields for Browser Use strict mode:

- `snapshot` rejects: `format`, `snapshotFormat`, `wait_until`, `state`, `mode`, `max_chars`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`
- `extract` rejects: `mode`, `selector`, `frame`
- `wait` rejects: `state`
- `screenshot` rejects: `full_page`, `ref`, `element`, `type`, `quality`

These rejections return:

- `error_code="INVALID_ARGUMENT"`

Important drift note:

- `tools/browser/schemas.py` still exposes many compatibility fields for shared schema parity, but adapter may intentionally reject them at runtime.

## Action Family Routing Details

`open`:

- maps to Browser Use `navigate` with `new_tab=True`
- always tags result as `action="open"` and includes `browser_use_action="navigate"`

`type`:

- maps to Browser Use `input` (`index` resolved from `ref`)
- optional `submit=true` triggers additional `send_keys` Enter call

`press`:

- maps to Browser Use `send_keys`

`switch_tab`:

- maps to Browser Use `switch`

`click`:

- accepts either index/ref or coordinate pair
- rejects half-specified coordinate payloads

`wait`:

- maps numeric seconds to rounded int for Browser Use wait
- empty payload allowed (runtime-dependent default wait behavior)

`close`:

- tab-aware close -> Browser Use action path
- otherwise closes runtime session directly

## `act` Wrapper Fan-Out

`act.request.kind` dispatch:

- compat kinds (`click`, `type`, `press`, `wait`, `evaluate`) normalize payload then route through generic `execute`
  - `wait` converts `timeMs` -> `seconds`
  - `evaluate` maps `fn` -> `script`
- forward kinds (`navigate`, `extract`, `scroll`, `screenshot`) route via generic `execute`
- Browser Use direct kinds route via generic `execute` (canonical runtime path)
- `close` picks tab-close vs full-close path

Unsupported kinds return:

- `error_code="ACTION_UNSUPPORTED"`

Test-backed behavior:

- unsupported `hover` kind errors
- forward/direct kind sets are exercised through adapter regression tests

## Error Code Surface

Canonical adapter error codes:

- `INVALID_ARGUMENT`: malformed or disallowed payload
- `BROWSER_NOT_CONNECTED`: connection-required action without active connection
- `ACTION_UNSUPPORTED`: unknown action or unsupported `act.kind`
- `BROWSER_RUNTIME_ERROR`: runtime execution failure or runtime-level invalid parameters

Runtime-error mapping path:

- runtime exception text containing `"invalid parameters"` maps to `INVALID_ARGUMENT`
- all other runtime exceptions map to `BROWSER_RUNTIME_ERROR`

## Adapter Instance Caching

`get_browser_use_adapter(controller, ...)` caching behavior:

- weak-key cache for weakrefable controller instances
- non-weakrefable controller test doubles bypass caching
- explicit runtime-provider injection bypasses cache/factory

Test-backed behavior:

- same controller returns same adapter instance under cache path
- runtime factory invoked only once for cached controller

## Debug Sequence

If payload validates in schema but fails at runtime:

1. inspect adapter compatibility-field rejection rules
2. inspect `_build_browser_use_action_params(...)` output for normalized params
3. inspect action connection requirements and controller connected state

If action reaches runtime but still fails:

1. inspect runtime action name (`browser_use_action` field)
2. inspect returned adapter `error_code`
3. inspect whether action was retagged (for `open`, `switch_tab`, `type`, `press`)

If tab switch/close targets wrong tab:

1. inspect `_extract_tab_id(...)` 4-char truncation behavior
2. inspect incoming `tab_id/target_id/targetId` source field
3. verify runtime tabs payload target IDs use same suffix format

## Related Pages

- [Frontend Sidecar Browser Docs Hub](README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Automation Stack](../browser_automation_stack.md)
