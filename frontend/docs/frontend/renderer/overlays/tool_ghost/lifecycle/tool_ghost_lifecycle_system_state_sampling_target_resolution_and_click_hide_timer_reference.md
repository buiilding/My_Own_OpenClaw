---
summary: "Deep reference for current tool-ghost debug lifecycle: loop state, timer cleanup, and sync-delay driven visibility behavior."
read_when:
  - When changing `ToolGhostDebugApp` lifecycle state transitions or timer behavior.
  - When debugging ghost debug loop not hiding/restarting at expected cadence.
title: "Tool Ghost Debug Lifecycle and Timer Reference"
---

# Tool Ghost Debug Lifecycle and Timer Reference

## Canonical Modules

- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`

## Lifecycle State Machine

Debug harness state:

- `isVisible`
- `runToken`
- timers:
  - `hideTimerRef`
  - `loopTimerRef`

Cycle (`runAnimationOnce`):

1. clear existing timers
2. increment `runToken` (forces remount key)
3. set visible true
4. schedule hide through `DesktopToolGhostRuntime.scheduleToolGhostTimer(...)`
   using `DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs(...)`
5. after hide, schedule next run after `LOOP_GAP_MS`

## Timer and Cleanup Contract

`clearTimers()`:

- clears hide + loop timers through `DesktopToolGhostRuntime.clearToolGhostTimer(...)`
- sets refs back to `null`

`useEffect` lifecycle:

- starts loop on mount
- always clears timers on unmount

Guarantee:

- no stale timer callbacks survive unmount
- raw browser timeout calls stay in `DesktopToolGhostRuntime`, not
  `ToolGhostDebugApp`

## Sync Delay Contract

The debug lifecycle intentionally uses the same runtime facade as tool-click sync semantics:

- `DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs(...)` from
  `desktopToolGhostRuntime.ts`
- `DesktopToolGhostRuntime.scheduleToolGhostTimer(...)` and
  `DesktopToolGhostRuntime.clearToolGhostTimer(...)` from the same app-runtime
  facade

This keeps debug cursor timing aligned with expected click timeline duration.

## Drift Hotspots

1. changing delay constants without updating both runtime and docs causes false timing diagnostics.
2. removing `runToken` keyed remount can preserve stale CSS animation state across loops.
3. incomplete timer cleanup can produce double-loop behavior after remounts.

## Related Pages

- [Renderer Tool-Ghost Lifecycle Docs Hub](README.md)
- [Tool Ghost Debug Track Style and CSS Class Contract Reference](tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
- [Tool Ghost Debug Cursor Payload and Timing Reference](../tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
