---
summary: "Deep reference for current tool-ghost debug cursor harness: static track payload, timing facade, and looped visibility behavior."
read_when:
  - When changing `ToolGhostDebugApp` animation timing or static track style payload.
  - When debugging mismatch between debug ghost loop timing and `DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs(...)`.
title: "Tool Ghost Debug Cursor Payload and Timing Reference"
---

# Tool Ghost Debug Cursor Payload and Timing Reference

## Canonical Modules

- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`

## Runtime Scope

Current page documents the debug harness only.

- no production tool-call JSON parsing in current `ChatBoxResponse` runtime.
- no `toolGhostPreview.js` payload parser module in current frontend tree.

## Static Track Payload Contract

`ToolGhostDebugApp` uses fixed `TRACK_STYLE` CSS vars:

- `--ghost-start-left/top`
- `--ghost-end-left/top`
- `--ghost-ripple-left/top`
- `--ghost-target-scale`
- `--ghost-motion-duration` (derived from `DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs(...)`)

This payload is intentionally deterministic for repeatable debug animation.

## Timing Contract

- active animation duration: `DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs(...)`
- post-run gap before restart: `LOOP_GAP_MS = 700`
- hide/restart timer schedule and cleanup: `DesktopToolGhostRuntime.scheduleToolGhostTimer(...)`
  and `DesktopToolGhostRuntime.clearToolGhostTimer(...)`
- lifecycle:
  1. show ghost
  2. hide at sync delay
  3. restart after loop gap

## Markup Class Contract

Harness root:

- `.chatbox-tool-ghost`

Track classes:

- `.chatbox-tool-ghost-track is-targeted is-click-animating is-moving`

Child nodes:

- `.chatbox-tool-ghost-target-ripple is-click-timeline`
- `ToolGhostCursor` (`.chatbox-tool-ghost-cursor*` classes)

## Drift Hotspots

1. Changing sync delay constant without updating debug expectations desynchronizes loop cadence.
2. Renaming CSS variable keys in `TRACK_STYLE` without stylesheet parity breaks cursor placement.
3. Removing `key={runToken}` remount behavior can leave stale animation states in repeated loops.

## Related Pages

- [Renderer Overlay Tool Ghost Docs Hub](README.md)
- [Tool Ghost Debug Lifecycle and Timer Reference](lifecycle/tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Debug Track Style and CSS Class Contract Reference](lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
- [Response Overlay Phase Runtime Reference](../response_overlay_phase_and_tool_ghost_runtime_reference.md)
