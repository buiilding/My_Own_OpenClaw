---
summary: "Deep reference for BrowserRuntimeAdapter dispatch order, canonical parameter mapping, and tool-facing error semantics under the strict grouped browser contract."
read_when:
  - When changing browser action payload contracts in `browser_adapter.py` or `browser_tool.py`.
  - When debugging why a schema-valid browser payload still fails adapter/runtime execution.
title: "Browser Adapter Action Routing Reference"
---

# Browser Adapter Action Routing and Compatibility Semantics Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_adapter.py`
- `frontend/src/main/python/tools/browser/browser_action_contract.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`
- `tests/sidecar/tools/test_browser_tool.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`

## Entrypoint Boundary (`browser_tool.py`)

`execute_browser(raw_args)`:

1. requires dict payload and `action`
2. gates action against `BROWSER_ROUTED_ACTIONS`
3. validates the payload against the shared `BrowserControlArgs` contract
4. invokes adapter for canonical grouped payloads only

## Adapter Dispatch Topology

`BrowserRuntimeAdapter.execute(...)` order:

1. explicit handlers: `connect`, `profiles`
2. canonical `close` -> runtime session close
3. canonical runtime actions -> `execute_browser_use_action(...)`

Unknown action:

- `success=False`
- `error_code="ACTION_UNSUPPORTED"`

## Connection Gate Semantics

Actions in `BROWSER_ACTIONS_REQUIRING_CONNECTION` fail fast when disconnected:

- `error_code="BROWSER_NOT_CONNECTED"`
- message instructs `connect` first

## Parameter Mapping Rules

Core normalizers:

- `_extract_url`: canonical `url` only
- `_extract_index`: integer `index` or numeric `ref`
- `_extract_tab_id`: canonical `tab_id` -> trailing 4 chars
- `_extract_coordinate`: int/float accepted, bool rejected

Schema-invalid compatibility payloads no longer reach the adapter; they fail earlier in `browser_tool.py`.

## Action Family Routing Details

`click`:

- supports index/ref or coordinates
- rejects partial coordinate payloads

`wait`:

- uses `seconds` param for runtime wait
- empty payload allowed (runtime default behavior)

`close`:

- full runtime close only

`close_tab`:

- maps to Browser Use runtime action `close`

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

`get_browser_adapter(controller, ...)`:

- weak-key cache for weakrefable controllers
- non-weakrefable test doubles bypass cache
- explicit runtime-provider injection bypasses cache/factory

## Debug Sequence

If schema passes but adapter fails:

1. inspect `_build_browser_use_action_params(...)` output
2. verify connection-required action preconditions
3. confirm runtime action mapping from `BROWSER_RUNTIME_ACTIONS`

If runtime call fails:

1. inspect `browser_use_action` value
2. inspect adapter `error_code`
3. confirm runtime payload action tagging for canonical actions

If tab targeting is wrong:

1. inspect `_extract_tab_id(...)` suffix normalization
2. verify incoming canonical `tab_id`

## Related Pages

- [Frontend Sidecar Browser Docs Hub](README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Automation Stack](../browser_automation_stack.md)
