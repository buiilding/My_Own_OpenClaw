---
summary: "Renderer overlay tool-ghost docs sub-hub for current debug-harness cursor animation flow and retired production tool-ghost notes."
read_when:
  - When changing `ToolGhostDebugApp` / `ToolGhostCursor` debug animation behavior.
  - When auditing historical tool-ghost docs against current production overlay runtime.
title: "Renderer Overlay Tool Ghost Docs Hub"
---

# Renderer Overlay Tool Ghost Docs Hub

## Deep Pages

- [Tool Ghost Debug Cursor Payload and Timing Reference](tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Renderer Tool-Ghost Lifecycle Docs Hub](lifecycle/README.md)
- [Tool Ghost Debug Lifecycle and Timer Reference](lifecycle/tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Debug Track Style and CSS Class Contract Reference](lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)

## Related Pages

- [Frontend Renderer Overlay Docs Hub](../README.md)
- [Response Overlay Phase Runtime Reference](../response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)

## Code Scope

- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`

## Current Status

- Production response overlay no longer runs the old tool-call JSON preview + motion lifecycle pipeline.
- Tool ghost artifacts in this section are debug-focused and retained for development/demo workflows.
