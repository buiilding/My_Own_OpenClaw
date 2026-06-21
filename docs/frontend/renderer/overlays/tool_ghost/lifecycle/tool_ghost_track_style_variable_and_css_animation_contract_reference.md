---
summary: "Deep reference for current debug tool-ghost track style contract: static CSS variable map, class tokens, and animation-loop expectations."
read_when:
  - When changing `TRACK_STYLE` payload keys in `ToolGhostDebugApp`.
  - When changing tool-ghost class selectors or animation behavior in debug overlay CSS.
title: "Tool Ghost Debug Track Style and CSS Class Contract Reference"
---

# Tool Ghost Debug Track Style and CSS Class Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`

## Static Style Variable Contract

`TRACK_STYLE` emits deterministic CSS variables:

- `--ghost-start-left`
- `--ghost-start-top`
- `--ghost-end-left`
- `--ghost-end-top`
- `--ghost-ripple-left`
- `--ghost-ripple-top`
- `--ghost-target-scale`
- `--ghost-motion-duration`

`--ghost-motion-duration` must stay aligned with
`DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs(...)`.

## Class Token Contract

Track class list in debug harness:

- `chatbox-tool-ghost-track`
- `is-targeted`
- `is-click-animating`
- `is-moving`

Ripple class list:

- `chatbox-tool-ghost-target-ripple`
- `is-click-timeline`

Cursor subtree classes come from `ToolGhostCursor`.

## Current Runtime Scope

- this style contract is debug-harness scoped.
- production response overlay no longer maps model tool-call payloads into dynamic tool-ghost track style variables.

## Drift Hotspots

1. renaming CSS variable keys in JS without stylesheet parity breaks positioning/ripple.
2. class-token changes in debug app without CSS updates silently remove animation styling.
3. duration drift between style payload and sync constant causes timing mismatch across loop phases.

## Related Pages

- [Renderer Tool-Ghost Lifecycle Docs Hub](README.md)
- [Tool Ghost Debug Lifecycle and Timer Reference](tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Debug Cursor Payload and Timing Reference](../tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Response Overlay Phase Runtime Reference](../../response_overlay_phase_and_tool_ghost_runtime_reference.md)
