---
summary: "Phase 2 compatibility-wrapper implementation status for browser_control adapter routing."
read_when:
  - Continuing Browser Use Phase 2 execution work.
  - Verifying which browser_control actions are now routed through browser_use_adapter.
  - Planning the next step to swap adapter internals from legacy controller calls to Browser Use primitives.
---

# Browser Use Port Phase 2 Compatibility Wrapper Progress

Updated: **February 16, 2026**

## Phase 2 Goal Alignment

Phase 2 tasks from `docs/BROWSER_USE_PORT_IMPLEMENTATION_PLAN.md`:

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
- `close`

Additional routing update:

- `profiles`, `snapshot`, `extract`, and `act` are now routed through adapter dispatch as well.
- `act` is now adapter-native (no legacy delegate).
- `extract` is now adapter-native (no legacy delegate).
- `snapshot` is now adapter-native (no legacy delegate).
- Removed now-unused `legacy_handlers` seam from adapter construction after delegate retirement.

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

## Remaining Phase 2 Work

- Current adapter implementation is still backed by legacy `BrowserController` internals.
- Replace controller-backed adapter internals action-by-action with Browser Use runtime primitives while preserving the same adapter return contract.
