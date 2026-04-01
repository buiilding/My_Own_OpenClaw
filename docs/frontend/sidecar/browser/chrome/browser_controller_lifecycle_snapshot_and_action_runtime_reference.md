---
summary: "Deep reference for BrowserController connection lifecycle, tab-scoped observer buffers, snapshot mode routing, role-ref disambiguation, click fallback strategy, and cleanup guarantees."
read_when:
  - When changing BrowserController connect/close flow, tab management, or observer capture buffers.
  - When debugging role-ref ambiguity, click fallback behavior, or snapshot mode selection between ai/aria/role paths.
title: "Browser Controller Lifecycle, Snapshot, and Action Runtime Reference"
---

# Browser Controller Lifecycle, Snapshot, and Action Runtime Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/controller.py`
- `frontend/src/main/python/tools/browser/action_executor.py`
- `frontend/src/main/python/tools/browser/observation_store.py`
- `frontend/src/main/python/tools/browser/session_runtime.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/navigation_runtime.py`
- `frontend/src/main/python/tools/browser/browser_use/browser/watchdog_supervisor.py`
- `frontend/src/main/python/tools/browser/chrome_launcher.py`
- `frontend/src/main/python/tools/browser/chrome_detection.py`
- `tests/sidecar/tools/test_browser_controller.py`
- `tests/sidecar/tools/test_browser_observation_store.py`
- `tests/sidecar/tools/test_browser_session_runtime.py`

## Session State Model

`BrowserSessionRuntime` owns the live active-session fields for:

- Playwright handles (`_playwright`, `_browser`, `_context`, `_page`)
- connect mode (`_mode`: `user_chrome` or `managed`)
- CDP URL (`_cdp_url`)
- optional managed temp profile dir (`_user_data_dir`)
- trace/headless flags used by diagnostics and launch helpers

`BrowserController` remains the public execution surface and proxies those fields through the runtime object.

Imperative browser actions now live behind `BrowserActionExecutor`:

- ref resolution / role-ref disambiguation
- click fallback policy
- cookie/storage/context mutation
- input, scroll, screenshot, PDF, dropdown, viewport, and JS-eval actions

`BrowserController` still exposes the same public methods and tool-facing contract, but those methods now delegate instead of owning the action logic directly.

Tab-scoped observation ownership:

- `BrowserObservationStore` owns per-tab ref registries, role refs, observer-installed tab ids, console/dialog/page-error buffers, and network request records
- `BrowserController` remains the public execution surface, but delegates tab-scoped observation state to the store

Singleton boundary:

- `get_browser_controller()` memoizes one process-local instance
- `reset_browser_controller()` resets singleton for tests

## Connection Paths

### `auto_connect_to_chrome(...)`

Security gate:

- rejects non-localhost CDP hosts (`localhost` / `127.0.0.1` only)

Connect flow:

1. checks prior CDP availability
2. calls `ensure_chrome_with_cdp(...)` (dedicated Windie instance policy)
3. starts Playwright and connects via `chromium.connect_over_cdp(...)`
4. reuses first context/page when present, otherwise creates new
5. installs tab observers
6. sets mode `user_chrome`
7. resets ref registry for active page
8. returns payload with `auto_launched` flag

Failure behavior:

- `ChromeLauncherError` and generic failures both trigger `close()` cleanup before raising `ConnectionError`

### `connect_to_user_chrome(...)`

Also enforces localhost-only CDP host gate and connects directly to provided endpoint. No launcher call.

### `launch_managed_browser(...)`

Managed isolated browser path:

- resolves executable (auto-detect if absent)
- creates temp profile directory (`tempfile.mkdtemp(prefix="windieos_browser_")`)
- uses `chromium.launch_persistent_context(...)`
- intentionally does not pass `--user-data-dir` via `args` (Playwright requirement)
- mode set to `managed`

## Tab and Observer Semantics

Tab identity:

- target IDs use `str(id(page))`

Per-tab capture stores (bounded):

- console messages: max 500
- dialog events: max 100
- page errors: max 200
- network requests: max 500

State boundaries:

- controller still decides when observers are attached and when events are recorded
- observation-store owns the underlying tab-scoped data structures and reset behavior
- action-executor owns imperative page interaction behavior

Observer installation (`_ensure_page_observers`) is one-time per tab and wires:

- `console`
- `dialog`
- `pageerror`
- `request`
- `response`
- `requestfailed`

Dialog handling:

- `arm_dialog(...)` stores next-action policy per active tab
- `_handle_dialog_event(...)` applies accept/dismiss and resolves waiting futures
- `wait_for_dialog(timeout_ms)` waits for next event then unregisters waiter

## Snapshot Mode Routing

`get_page_snapshot(...)` dispatches by requested mode:

- `format_type="aria"` -> `_get_aria_snapshot`
- otherwise:
  - if role-snapshot triggers exist (`refs_mode`, `interactive`, `compact`, `depth`, `selector`, `frame_selector`) -> `_get_role_snapshot`
  - else -> `_get_ai_snapshot`

### AI snapshot path

Primary path:

- calls `EnhancedCdpDomPipeline.build_ai_snapshot(...)`
- builds `PageSnapshot` from enhanced result

Fallback path:

- any enhanced pipeline exception falls back to `_get_ai_snapshot_legacy(...)`

Legacy path behavior:

- query-selects common interactive elements
- emits tree-like ancestor scaffolding
- assigns refs via `RefRegistry`
- sets `data-windie-ref` on matched elements

### Role snapshot path

- parses locator `aria_snapshot()` using `build_role_snapshot_from_aria_snapshot(...)`
- stores `eN` refs per tab
- supports interactive/compact/depth/selector/frame scoping
- returns refs dictionary + snapshot stats (`lines/chars/refs/interactive`)

### Aria snapshot path

- captures `:root` `aria_snapshot()` text
- no refs returned (`ref_count=0`)
- applies `max_chars` truncation logic

## Ref Resolution and Click Semantics

Ref resolution priority:

1. parse role ref (`eN`) -> resolve via `get_by_role(...)` (+ optional `nth`, optional frame scope)
2. fallback selector: `[data-windie-ref='<ref>'], [aria-ref='<ref>']`

`_resolve_click_locator` disambiguation for role refs without explicit `nth`:

- counts candidates
- probes visibility (up to 25 candidates)
- if viewport known, prefers exactly one visible candidate intersecting viewport
- otherwise prefers exactly one visible candidate
- if multiple remain, raises explicit ambiguity error with candidate counts

Click strategy in `click(...)` (implemented in `BrowserActionExecutor.click(...)`):

1. default click/dblclick (`timeout=2500ms`)
2. on recoverable error:
   - for left-click, try select-option fallback for native `select/option` targets
   - then force click (`timeout=1500ms`)
   - then left-click-only DOM `el.click()` fallback
3. non-recoverable or exhausted fallback -> structured failure

Recoverable markers include pointer interception, visibility/stability/detach issues, and timeout patterns.

## Action Surface Highlights

Navigation and tabs:

- `navigate`, `open_tab`, `get_tabs`, `switch_tab`, `get_status`
- navigation/new document reset ref registry

Page interaction:

- `type_text`, `press_key`, `scroll`, `hover`, `drag`, `select_options`, `set_input_files`, `fill_fields`

Capture and diagnostics:

- `screenshot` with mutual exclusion checks (`full_page` vs `ref/element`)
- `pdf`
- `trace_start` / `trace_stop`
- `get_console_messages`, `get_dialog_events`, `get_page_errors`, `get_network_requests`

Context mutation helpers:

- cookies/storage set/get/clear
- offline/headers/http credentials/geolocation/media
- device preset viewport changes
- timezone/locale return explicit unsupported-at-runtime errors

## `browser_use` Session Runtime Ownership

`browser_use` `BrowserSession` now keeps the public event handlers but delegates two large lifecycle domains:

- `BrowserSessionNavigationRuntime`
  - navigation to URL
  - navigation lifecycle waiting
  - tab create/switch/close handling
  - focus-change cache clearing and viewport re-application
  - download tracking
- `BrowserWatchdogSupervisor`
  - watchdog attachment
  - watchdog-reset ownership during session reset

This keeps the event surface stable while reducing the amount of tab/watchdog state owned inline by `session.py`.

## Cleanup Guarantees (`close`)

`close()` attempts:

1. close browser and stop Playwright
2. remove managed temp profile dir (best effort)
3. clear all per-tab registries, observer caches, request-id maps, and trace flags
4. reset mode/context/page/CDP state

Cleanup exceptions are logged and do not raise to caller.

## Test-Backed Contracts

`tests/sidecar/tools/test_browser_controller.py` verifies:

- localhost security gate on connect
- managed launch uses `launch_persistent_context` with `user_data_dir` argument and no `--user-data-dir` CLI flag
- click fallback ordering (`select_option` -> force -> no DOM for non-left button)
- role-ref disambiguation behavior (viewport-preferred single candidate vs ambiguity error)
- AI snapshot enhanced-path success and enhanced->legacy fallback
- aria snapshot truncation behavior
- singleton getter/reset behavior

`tests/sidecar/tools/test_browser_observation_store.py` verifies:

- console-message filtering/limit/clear behavior
- network request lifecycle updates (`request` -> `response` -> `requestfailed`)
- dialog waiter resolution and pruning

`tests/sidecar/tools/test_browser_session_runtime.py` verifies:

- connection/current-page metadata projection
- runtime reset clears live handles and trace/headless flags

## Related Pages

- [Frontend Sidecar Browser Chrome Docs Hub](README.md)
- [Chrome Detection, Launcher, and CDP Session Reference](chrome_detection_launcher_and_cdp_session_reference.md)
- [Enhanced CDP DOM Snapshot Pipeline Runtime Reference](enhanced_cdp_dom_snapshot_pipeline_runtime_reference.md)
