---
summary: "Deep reference for BrowserUseCompatibilityAdapter dispatch order, canonical/legacy/removed alias behavior, parameter normalization/rejection rules, and tool-facing error semantics."
read_when:
  - When changing browser action payload contracts in `browser_adapter.py` or `browser_tool.py`.
  - When debugging why schema-valid compatibility payloads are rejected by adapter normalization or alias policy gates.
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

## Entrypoint Boundary (`browser_tool.py`)

`execute_browser(raw_args)`:

1. requires dict payload and `action`
2. gates action against `PHASE2_ADAPTER_ROUTED_ACTIONS`
3. blocks removed aliases (`open`, `switch_tab`, `press`, `act`) with migration errors
4. applies legacy alias env gate for `type`
5. invokes adapter for forwarded actions

## Adapter Dispatch Topology

`BrowserUseCompatibilityAdapter.execute(...)` order:

1. explicit handlers: `connect`, `profiles`
2. removed alias guard (`open`, `switch_tab`, `press`, `act`) -> `INVALID_ARGUMENT`
3. legacy alias handler: `type`
4. canonical actions -> `execute_browser_use_action(...)`
5. canonical `close` split:
- with tab identity -> runtime action path
- without tab identity -> runtime session close

Unknown action:

- `success=False`
- `error_code="ACTION_UNSUPPORTED"`

## Connection Gate Semantics

Actions in `BROWSER_USE_ACTIONS_REQUIRING_CONNECTION` fail fast when disconnected:

- `error_code="BROWSER_NOT_CONNECTED"`
- message instructs `connect` first

## Parameter Normalization and Rejection Rules

Core normalizers:

- `_extract_url`: `url`, `target_url`, `targetUrl`
- `_extract_index`: integer `index` or numeric `ref`
- `_extract_tab_id`: `tab_id` / `target_id` / `targetId` -> trailing 4 chars
- `_extract_coordinate`: int/float accepted, bool rejected

Compatibility-field rejections:

- `snapshot` rejects: `format`, `snapshotFormat`, `wait_until`, `state`, `mode`, `max_chars`, `refs`, `interactive`, `compact`, `depth`, `selector`, `frame`
- `extract` rejects: `mode`, `selector`, `frame`
- `wait` rejects: `state`
- `screenshot` rejects: `full_page`, `ref`, `element`, `type`, `quality`

Rejected payloads return `INVALID_ARGUMENT`.

## Action Family Routing Details

`type`:

- requires `ref` + `text`
- maps to runtime `input`
- optional `submit=true` emits additional runtime `send_keys` Enter call
- result is retagged back to `action="type"`

`click`:

- supports index/ref or coordinates
- rejects partial coordinate payloads

`wait`:

- uses `seconds` param for runtime wait
- empty payload allowed (runtime default behavior)

`close`:

- with tab id: runtime close-tab path
- without tab id: full runtime close

## Error Code Surface

Canonical adapter error codes:

- `INVALID_ARGUMENT`
- `BROWSER_NOT_CONNECTED`
- `ACTION_UNSUPPORTED`
- `BROWSER_RUNTIME_ERROR`

Runtime exception mapping:

- messages containing `invalid parameters` -> `INVALID_ARGUMENT`
- all others -> `BROWSER_RUNTIME_ERROR`

## Adapter Instance Caching

`get_browser_use_adapter(controller, ...)`:

- weak-key cache for weakrefable controllers
- non-weakrefable test doubles bypass cache
- explicit runtime-provider injection bypasses cache/factory

## Debug Sequence

If schema passes but adapter fails:

1. inspect alias category and gate decision (removed/legacy/canonical)
2. inspect `_build_browser_use_action_params(...)` output
3. verify connection-required action preconditions

If runtime call fails:

1. inspect `browser_use_action` value
2. inspect adapter `error_code`
3. confirm action retagging only applies to `type`

If tab targeting is wrong:

1. inspect `_extract_tab_id(...)` suffix normalization
2. verify incoming tab identity field source

## Related Pages

- [Frontend Sidecar Browser Docs Hub](README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Automation Stack](../browser_automation_stack.md)
