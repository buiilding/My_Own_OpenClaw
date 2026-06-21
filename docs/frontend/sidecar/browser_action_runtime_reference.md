---
summary: "Detailed browser tool action reference for canonical Browser Use CLI routing, strict schema policy, browser `replace_file` old_str/new_str rejection, and error/timeout semantics across renderer-main-sidecar."
read_when:
  - When changing browser action payload fields, action names, strict schema policy, or Browser Use engine normalization logic.
  - When debugging browser `replace_file` payloads, canonical `old_string` / `new_string` fields, or rejected `old_str` / `new_str` aliases.
  - When debugging browser action failures caused by local-runtime validation, Browser Use CLI execution, or timeout boundaries.
title: "Browser Action Runtime Reference"
---

# Browser Action Runtime Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `frontend/src/main/python/windie_shared/browser_contract*.py`

## Runtime Invariants

- Browser tool entrypoint accepts only object args and requires `action`.
- Browser actions route through `BrowserUseEngineRuntime`.
- The local-runtime Python browser adapter owns runtime validation, removed-alias rejection, Chrome/CDP launch policy, local file helpers, and result normalization.
- Browser Use owns daemon/session mechanics, DOM state extraction, numeric element indexes, interactions, screenshots, tabs, and browser recovery behavior.
- Removed aliases are blocked by the shared browser schema and do not reach runtime execution.
- `connect` always targets the WindieOS dedicated localhost CDP endpoint.

## End-to-End Action Path

1. SDK runtime receives a backend `browser` tool-call event.
2. Electron main forwards JSON-RPC `execute_tool`.
3. Browser tool has extended timeout (`120000ms`; non-browser tools `60000ms`).
4. Sidecar `LocalRuntimeService._handle_execute_tool` calls `ToolRegistry.execute_tool("browser", args)`.
5. `browser_tool.execute_browser` validates `BrowserControlArgs`.
6. `BrowserUseEngineRuntime.execute` maps the canonical action to a Browser Use CLI command or adapter-owned helper.

## Action Families and Routing

Adapter-owned helpers:

- `connect`, `status`, `profiles`
- deterministic `extract`, `find_text`, `find_elements`, `search_page`
- browser-local `write_file`, `replace_file`, `read_file`, `read_long_content`
- browser-internal URL handling for canonical `navigate` payloads

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

- accepts Browser Use numeric `index`
- `ref` aliases and Windie role refs such as `e12` are rejected by validation
- indexes must come from the latest `snapshot.output`; `find_elements` returns
  non-actionable CSS-query `ordinal` values

### `replace_file`

- uses browser-local file paths under the browser file root
- requires `old_string` and `new_string`; `old_str` and `new_str` are not valid
  browser action fields

## Error and Timeout Surface

- `INVALID_ARGUMENT`: payload validation or unsupported argument shape
- `ACTION_UNSUPPORTED`: unknown action
- `BROWSER_USE_ENGINE_UNAVAILABLE`: Browser Use CLI package is unavailable
- `BROWSER_USE_ENGINE_TIMEOUT`: Browser Use command timeout
- `BROWSER_USE_ENGINE_ERROR`: Browser Use command/runtime failure, including
  successful CLI envelopes whose `data` field is not a JSON object
- `BROWSER_RUNTIME_ERROR`: unexpected local-runtime browser runtime failure

## Related Pages

- [Local-Runtime Browser Docs Hub](browser/README.md)
- [Browser Automation Stack](browser_automation_stack.md)
- [Browser Tool](../../tools/browser.md)
