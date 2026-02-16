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

## Routed Actions (Phase 2 Batch)

`browser_tool.execute_browser_control` now routes these actions via adapter:

- `connect`
- `status`
- `navigate`
- `open`
- `press`
- `scroll`
- `wait`
- `get_tabs`
- `switch_tab`
- `evaluate`
- `close`

All other actions remain on existing direct handlers in this phase.

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
```

Results:

- `test_browser_tool.py`: pass
- `test_browser_tool.py` + `test_browser_controller.py`: pass

Additional regression assertions added in:

- `tests/sidecar/tools/test_browser_tool.py` (`TestPhase2AdapterRouting`)

## Remaining Phase 2 Work

- Current adapter implementation is still backed by legacy `BrowserController` internals.
- Next migration slice should replace adapter internals action-by-action with Browser Use runtime primitives while preserving the same adapter return contract.

