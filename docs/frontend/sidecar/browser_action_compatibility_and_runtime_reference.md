---
summary: "Detailed browser tool action reference for canonical Browser Use CLI routing, strict schema policy, and error/timeout semantics across renderer-main-sidecar."
read_when:
  - When changing browser action payload fields, action names, strict schema policy, or Browser Use engine normalization logic.
  - When debugging browser action failures caused by sidecar validation, Browser Use CLI execution, or timeout boundaries.
title: "Browser Action Compatibility and Runtime Reference"
---

# Browser Action Compatibility and Runtime Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `frontend/src/main/python/windie_shared/browser_contract*.py`

## Runtime Invariants

- Browser tool entrypoint accepts only object args and requires `action`.
- Browser actions route through `BrowserUseEngineRuntime`.
- WindieOS owns schema validation, removed-alias rejection, Chrome/CDP launch policy, local file helpers, and result normalization.
- Browser Use owns daemon/session mechanics, DOM state extraction, numeric element indexes, interactions, screenshots, tabs, and browser recovery behavior.
- Removed aliases are blocked by the shared browser schema and do not reach runtime execution.
- `connect` always targets the WindieOS dedicated localhost CDP endpoint.

## End-to-End Action Path

1. SDK runtime receives a backend `browser` tool-call event.
2. Electron main forwards JSON-RPC `execute_tool`.
3. Browser tool has extended timeout (`120000ms`; non-browser tools `60000ms`).
4. Sidecar `LocalBackend._handle_execute_tool` calls `ToolRegistry.execute_tool("browser", args)`.
5. `browser_tool.execute_browser` validates `BrowserControlArgs`.
6. `BrowserUseEngineRuntime.execute` maps the canonical action to a Browser Use CLI command or Windie-owned helper.

## Action Families and Routing

Windie-owned helpers:

- `connect`, `status`, `profiles`
- deterministic `extract`, `find_text`, `find_elements`, `search_page`
- browser-local `write_file`, `replace_file`, `read_file`, `read_long_content`
- compatibility shims such as `navigate` for browser-internal URLs

Browser Use CLI-backed actions:

- `snapshot`, `navigate`, `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`, `evaluate`
- `done`, `search`, `go_back`, `get_tabs`, `switch`, `close`, `close_tab`
- `select_dropdown`, `upload_file`, `hover`, `save_as_pdf`
- `get_text`, `get_value`, `get_attributes`, `get_bbox`

## Parameter Rules

### `snapshot`

- accepts `offset`, `limit`, and `include_screenshot`
- default limit is `4000`
- `offset + limit` must be at most `120000`

### `extract`

- requires non-empty `query`
- supports `extract_links`, `start_from_char`, and `output_schema`

### `click`, `input`, `hover`, `upload_file`, `select_dropdown`, `get_*`

- accepts Browser Use numeric `index` or numeric `ref`
- Windie role refs such as `e12` are rejected by validation/engine mapping
- indexes must come from the latest `snapshot.output`; `find_elements` returns
  non-actionable CSS-query `ordinal` values

## Error and Timeout Surface

- `INVALID_ARGUMENT`: payload validation or unsupported argument shape
- `ACTION_UNSUPPORTED`: unknown action
- `BROWSER_USE_ENGINE_UNAVAILABLE`: Browser Use CLI package is unavailable
- `BROWSER_USE_ENGINE_TIMEOUT`: Browser Use command timeout
- `BROWSER_USE_ENGINE_ERROR`: Browser Use command/runtime failure
- `BROWSER_RUNTIME_ERROR`: unexpected sidecar browser runtime failure

## Related Pages

- [Sidecar Browser Docs Hub](browser/README.md)
- [Browser Automation Stack](browser_automation_stack.md)
- [Browser Tool](../../tools/browser.md)
