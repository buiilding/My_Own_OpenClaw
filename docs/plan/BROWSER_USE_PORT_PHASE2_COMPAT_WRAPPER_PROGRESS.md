---
summary: "Phase 2 compatibility-wrapper implementation status for browser_control adapter routing."
read_when:
  - Continuing Browser Use Phase 2 execution work.
  - Verifying which browser_control actions are now routed through browser_use_adapter.
  - Planning the next step to swap adapter internals from legacy controller calls to Browser Use primitives.
---

# Browser Use Port Phase 2 Compatibility Wrapper Progress

Updated: **February 17, 2026**

## Phase 2 Goal Alignment

Phase 2 tasks from `docs/plan/BROWSER_USE_PORT_IMPLEMENTATION_PLAN.md`:

1. Introduce sidecar `tools/browser_use_adapter/*` module.
2. Route `browser_control` handlers through adapter where possible.
3. Preserve current backend/frontend payload contract.

This update delivers those tasks with compatibility-wrapper routing while preserving existing payload shape.

## Implemented Module

- `frontend/src/main/python/tools/browser_use_adapter/types.py`
  - Defines normalized adapter result contract (`AdapterActionResult`, `MigrationDecision`).
- `frontend/src/main/python/tools/browser_use_adapter/controller_adapter.py`
  - Adds `BrowserUseCompatibilityAdapter` dispatch and action methods.
  - Adds factory seam `get_browser_use_adapter(...)` for testable injection.
- `frontend/src/main/python/tools/browser_use_adapter/runtime_provider.py`
  - Adds runtime-provider seam for adapter internals.
  - Defaults to Browser Use native runtime provider and exposes runtime selection hook (`WINDIE_BROWSER_USE_RUNTIME`, with `browser_use` alias support).
  - Removes controller runtime fallback; startup now fails fast when Browser Use runtime is unavailable.
  - Adds `execute_browser_use_action(...)` runtime seam for direct Browser Use tool execution from adapter routing.
- `frontend/src/main/python/tools/browser_use_adapter/browser_use_native_runtime.py`
  - Adds optional Browser Use-native runtime factory entrypoint (`create_browser_use_native_runtime_provider`) for incremental action-level migration.
  - When `browser_use` is installed and `WINDIE_BROWSER_USE_RUNTIME=browser_use_native`, the factory now returns a dedicated native-provider class scaffold (`BrowserUseNativeRuntimeProvider`) instead of always returning `None`.
  - Adds action-level native override controls (`WINDIE_BROWSER_USE_NATIVE_ACTIONS`, `WINDIE_BROWSER_USE_NATIVE_ACTIONS_STRICT`) with safe fallback to controller-backed behavior.
  - Native override hooks now cover core session and interaction/capture methods (connect mode handlers, `click`, `type`, `press`, `scroll`, `screenshot`, `wait`, `wait_seconds`, `evaluate`, `snapshot`, `upload`) while preserving controller fallback.
  - Direct Browser Use action execution now routes through native handlers without requiring per-action env toggles.
- `frontend/src/main/python/tools/browser_use_adapter/browser_use_native_handlers.py`
  - Adds Browser Use action bridge (`Tools` registry + optional `BrowserSession` + `FileSystem`) and module-loading seam (`WINDIE_BROWSER_USE_NATIVE_HANDLER_MODULE`).
  - Ships handler coverage for Browser Use action names (`search`, `go_back`, `search_page`, `find_elements`, `find_text`, `input`, `send_keys`, `switch`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`, and more) plus `wait_seconds`.
- `frontend/src/main/python/tools/browser_use_adapter/__init__.py`
  - Exposes adapter types/factory.

## Routed Actions (Phase 2 Coverage)

`browser_tool.execute_browser_control` now routes these actions via adapter:

- `connect`
- `status`
- `navigate`
- `open`
- `click`
- `type`
- `press`
- `scroll`
- `screenshot`
- `wait`
- `get_tabs`
- `switch_tab`
- `evaluate`
- `console`
- `errors`
- `requests`
- `trace_start`
- `trace_stop`
- `pdf`
- `upload`
- `dialog`
- `cookies`
- `cookies_set`
- `cookies_clear`
- `storage_get`
- `storage_set`
- `storage_clear`
- `set_offline`
- `set_headers`
- `set_credentials`
- `set_geolocation`
- `set_media`
- `set_timezone`
- `set_locale`
- `set_device`
- `search`
- `go_back`
- `search_page`
- `find_elements`
- `find_text`
- `input`
- `send_keys`
- `switch`
- `close_tab`
- `dropdown_options`
- `select_dropdown`
- `upload_file`
- `write_file`
- `replace_file`
- `read_file`
- `read_long_content`
- `close`

Additional routing update:

- `profiles`, `snapshot`, `extract`, and `act` are now routed through adapter dispatch as well.
- `act` is now adapter-native (no legacy delegate).
- `extract` is now adapter-native (no legacy delegate).
- `snapshot` is now adapter-native (no legacy delegate).
- Removed now-unused `legacy_handlers` seam from adapter construction after delegate retirement.
- Core session/tab actions (`connect`, `status`, `navigate`, `open`, `get_tabs`, `switch_tab`, `close`) now execute via runtime-provider seam inside adapter.
- Runtime-provider seam coverage expanded to interaction/capture actions as well (`click`, `type`, `press`, `scroll`, `screenshot`, `wait`, `evaluate`, `snapshot`, `extract`, `upload`).

Current Phase 2 routing result:

- All supported `browser_control` actions now pass through `tools/browser_use_adapter` dispatch.

## Contract Compatibility

The adapter returns normalized `AdapterActionResult`, and `browser_tool` maps this back to existing `ToolResult` output contracts.

Preserved compatibility characteristics:

- Existing `browser_control(action=...)` schema unchanged.
- Existing frontend formatter keys preserved (`action`, `snapshot`, `result`, `message`, etc.).
- Existing sidecar/browser tests remain green without backend contract changes.

## Validation Evidence

Executed tests:

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_controller.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_use_adapter.py -q
```

Results:

- `test_browser_tool.py`: pass
- `test_browser_tool.py` + `test_browser_controller.py`: pass
- `test_browser_use_adapter.py`: pass

Additional regression assertions added in:

- `tests/sidecar/tools/test_browser_tool.py` (`TestPhase2AdapterRouting`)
- `tests/sidecar/tools/test_browser_use_adapter.py` (`TestBrowserUseCompatibilityAdapter`)

## Phase 2 Completion Gate

- Compatibility-wrapper routing is complete for all supported `browser_control` actions.
- Contract-preserving native runtime wiring is complete, including strict/fallback selection behavior.
- Browser Use-native action execution now includes a broad tool surface (not only `wait(seconds=...)`) through direct adapter routing.

## Next Slice (Phase 3)

- Continue replacing controller-backed internals action-by-action with Browser Use runtime primitives while preserving adapter output contracts.
