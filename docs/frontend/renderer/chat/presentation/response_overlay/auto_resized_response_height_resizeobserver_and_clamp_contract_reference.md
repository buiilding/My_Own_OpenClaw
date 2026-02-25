---
summary: "Deep reference for response-pill auto-resize hook behavior: enable/disable reset semantics, requestAnimationFrame + ResizeObserver scheduling, and min/max clamp rules used by ChatBoxResponse overlay height updates."
read_when:
  - When changing `useAutoResizedResponseHeight` measurement cadence, clamp limits, or dependency keys.
  - When debugging response overlay height jumps, stale sizing after message change, or ResizeObserver cleanup leaks.
title: "Auto-Resized Response Height ResizeObserver and Clamp Contract Reference"
---

# Auto-Resized Response Height ResizeObserver and Clamp Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useAutoResizedResponseHeight.js`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`

## Hook API Contract

`useAutoResizedResponseHeight({...})` expects:

- `activeResponseId`
- `bodyRef`
- `enabled`
- `minHeight`
- `maxHeight`
- `chromeHeight`

Return value:

- `responseHeight` numeric pixel value used by response-pill inline style.

## State and Reset Semantics

Initial state is always `minHeight`.

When `enabled` becomes `false`:

- hook immediately resets `responseHeight` to `minHeight`
- no observer or animation frame is left active for that run

Implication:

- awaiting/tool-call states collapse response shell height back to baseline without stale carryover from previous responses.

## Measurement Contract

Measured height formula:

- `bodyRef.current.scrollHeight + chromeHeight`

Clamp policy:

- lower bound: `minHeight`
- upper bound: `maxHeight`

Update guard:

- state write is skipped when computed height equals previous height (`prevHeight === nextHeight`)

This no-op guard reduces unnecessary rerenders during frequent resize callbacks.

## Scheduling and Observer Lifecycle

Recalculation path:

1. `scheduleRecalc()` cancels prior animation frame if still pending
2. schedules one `requestAnimationFrame`
3. frame callback runs `recalcHeight()`

Observer path:

- when `ResizeObserver` exists, observer subscribes to `bodyRef.current`
- observer callback only schedules rAF, not direct measurement

Cleanup path:

- disconnect observer
- cancel any pending animation frame

This keeps measurement cadence paint-aligned and avoids leaked callbacks on response swaps/unmount.

## Dependency and Recalculation Triggers

Effect dependencies:

- `activeResponseId`
- `bodyRef`
- `chromeHeight`
- `enabled`
- `maxHeight`
- `minHeight`

Practical trigger points:

- active response changes
- response mode toggles visible/hidden
- clamp constants change

## Integration Contract in `ChatBoxResponse`

`ChatBoxResponse` uses this hook only when `showResponse` is true.

Returned `responseHeight` is used in:

- inline response-pill style (`style={{ height: `${responseHeight}px` }}`)
- auto-scroll effect dependencies to keep bottom-stick behavior in sync with content height updates

## Coverage Boundary

Current coverage is indirect via `ChatBoxResponse` state/behavior tests.

Direct unit tests for `useAutoResizedResponseHeight` (observer cleanup, clamp boundaries, disabled reset) are not present.

## Drift Hotspots

1. Removing rAF scheduling in observer callbacks can increase synchronous layout thrash.
2. Dropping min/max clamps can produce oversized overlays that exceed shell sizing assumptions.
3. Omitting `enabled` reset semantics can leave stale heights when switching back to awaiting/tool-call phases.

## Related Pages

- [Renderer Chat Response-Overlay Presentation Docs Hub](README.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../../../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
