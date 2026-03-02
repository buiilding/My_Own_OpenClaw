---
summary: "Deep reference for sidecar browser runtime-provider selection, vendored Browser Use import enforcement, native handler module loading, and BrowserUseNativeRuntimeProvider action execution semantics."
read_when:
  - When changing `browser_runtime.py` provider selection, handler loading, or Browser Use bridge behavior.
  - When debugging runtime import failures, missing native handlers, deterministic extraction failures, or snapshot/window state payloads.
title: "Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference"
---

# Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/browser_runtime.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/controller.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`

## Runtime Provider Selection Contract

Primary selector:

- env: `WINDIE_BROWSER_USE_RUNTIME`
- accepted values: `browser_use`, `browser_use_native`
- unset defaults to `browser_use_native`

Failure behavior:

- unknown runtime value raises runtime error with supported value list
- missing Browser Use spec (`find_spec("browser_use") is None`) raises unavailable runtime error

Provider creation path:

1. enforce vendored Browser Use path policy
2. resolve/load native handler mapping
3. construct `BrowserUseNativeRuntimeProvider`

`browser_tool.py` and `browser_runtime.py` both enforce this selection policy for runtime-provider factory seams.

## Vendored Browser Use Enforcement

Runtime never trusts globally installed `browser_use` package.

`_ensure_vendored_browser_use_on_path()`:

- requires in-repo directory:
  - `frontend/src/main/python/tools/browser/browser_use`
- inserts `frontend/src/main/python/tools/browser` at `sys.path[0]`

`_assert_vendored_browser_use_resolves(...)`:

1. purges previously imported non-vendored `browser_use*` modules from `sys.modules`
2. imports `browser_use`
3. verifies imported module path is under vendored directory
4. raises explicit runtime error if resolution escapes vendored tree

Test-backed behavior:

- parity tests assert browser_use import origin is vendored
- requirements tests assert `browser-use` pip dependency is absent (vendored-only policy)

## Native Handler Module Loading

Handler module env:

- `WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE`
- default: `tools.browser.browser_runtime`

Required export:

- `get_native_runtime_handlers(...)`

`_load_native_handlers(...)` contracts:

1. imports configured module
2. resolves handler factory
3. calls factory (supports signatures with/without `controller`)
4. validates returned value is mapping of callable handlers
5. normalizes action keys to lowercase
6. fails closed when no callable handlers are produced

## BrowserUseNativeRuntimeProvider Semantics

`BrowserUseNativeRuntimeProvider` extends controller-backed provider for non-Browser-Use methods and overrides only Browser Use action dispatch:

- `execute_browser_use_action(action, params)`:
  - action lowercased
  - handler lookup from normalized native handler map
  - throws runtime error when handler missing
  - awaits coroutine handlers
  - wraps non-dict handler return values into success dict with `native_source="browser_use.tools"`

Test-backed invariants:

- missing handler path raises `"No Browser Use native handler..."`
- non-Browser-Use methods (`navigate`, etc.) still route through controller-backed methods

## Native Handler Registry (`get_native_runtime_handlers`)

Registry composition:

- special handlers:
  - `wait_seconds`
  - `snapshot`
  - `status`
  - `get_tabs`
- one generated handler per Browser Use action (`_BROWSER_USE_ACTIONS`)
- alias:
  - `close_tab` -> Browser Use `close`

`wait_seconds` policy:

- if controller disconnected: pure timer wait (`native_source="windie.timer"`)
- if connected:
  - tries Browser Use `wait`
  - on failure, falls back to timed wait with warning

Parity coverage:

- tests assert native handler registry covers every Browser Use registry action

## `_BrowserUseActionBridge` Session and Filesystem Semantics

Session mode derivation from controller private fields:

- `_mode == "user_chrome"` -> BrowserSession with `cdp_url`
- `_mode == "managed"` -> local BrowserSession (`is_local=True`, `headless=False`)
- non-inferable/invalid mode -> runtime error

Lifecycle behavior:

- session reused only when mode/cdp_url match previous session
- mode/cdp changes or disconnect trigger session stop/reset
- session operations are lock-serialized (`asyncio.Lock`) to avoid concurrent bridge races

Filesystem behavior:

- base dir env override: `WINDIE_BROWSER_USE_FILES_DIR`
- default: `~/.config/desktop-assistant/browser-use`
- file system created lazily with `create_default_files=True`

## Deterministic Extraction Contract

`extract` and `read_long_content` run in sidecar-native deterministic mode.

- no LLM adapter resolution in sidecar runtime
- no extraction provider/model/api-key env requirements
- Browser Use registry execution is bypassed for these two actions

Runtime path:

1. call vendored `browser_use.dom.markdown_extractor.extract_clean_markdown(...)`
2. build focused excerpt from markdown using query/goal terms
3. return deterministic payload with extraction metadata

`extract` contract:

- requires non-empty `query`
- optional `extract_links` (default `False`)
- optional `max_chars` clamped to sidecar cap (`MAX_DETERMINISTIC_EXTRACT_CHARS`)
- response includes:
  - `content`
  - `extracted_content`
  - metadata: `extraction_backend="sidecar_deterministic"`, pagination window fields

`read_long_content` contract:

- requires non-empty `goal`
- optional `offset` and `max_chars` (bounded)
- uses markdown extraction with links enabled
- response includes:
  - `extracted_content`
  - metadata: `extraction_backend="sidecar_deterministic"`, `offset`, `next_offset`, `has_more`, character counters

All other Browser Use actions still route through Browser Use registry with `page_extraction_llm=None`.

## Snapshot/Status/Tabs State Payload Contract

`capture_snapshot(...)`:

- reads Browser Use state summary
- supports paginated snapshot windows (`offset`, `limit`)
- hard cap: `offset + limit <= 120000`
- includes metadata:
  - `returned_chars`, `total_chars`, `has_more`, optional `next_offset`
- optional screenshot embedding only when requested and present
- emits `native_source="browser_use.state"`

`capture_status(...)`:

- disconnected path returns success with `connected=False`, empty page fields
- connected path reports url/title/tab_count/target_id from Browser Use state

`capture_tabs(...)`:

- serializes tabs to `target_id/title/url`
- truncates `target_id` to last 4 chars when longer

## Debug Sequence

If runtime creation fails:

1. verify vendored Browser Use directory exists
2. verify `WINDIE_BROWSER_USE_RUNTIME` value
3. inspect native handler module/factory import errors
4. verify Browser Use import path resolves under vendored directory

If `extract`/`read_long_content` fails:

1. verify connected browser session exists
2. verify required input (`query`/`goal`) is non-empty
3. inspect markdown extractor import: `browser_use.dom.markdown_extractor.extract_clean_markdown`
4. verify `offset/max_chars` window values are valid

If snapshot pagination fails:

1. verify `offset + limit` window under `120000`
2. inspect `has_more/next_offset` values
3. verify Browser Use session mode and connectivity at capture time

## Related Pages

- [Frontend Sidecar Browser Docs Hub](README.md)
- [Browser Runtime Deterministic Extraction Contract Reference](browser_runtime_deterministic_extraction_contract_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Browser Action Compatibility and Runtime Reference](../browser_action_compatibility_and_runtime_reference.md)
