---
summary: "Frontend renderer overlay docs sub-hub for minimal chat pill behavior, response overlay sizing, and residual tool-ghost debug harness references."
read_when:
  - When changing minimal chat pill/response overlay renderer components.
  - When debugging click-through behavior, drag/resize IPC, or response overlay sizing/visibility.
title: "Frontend Renderer Overlay Docs Hub"
---

# Frontend Renderer Overlay Docs Hub

## Deep Pages

- [Chatbox Overlay Input, Drag, and Click-Through Reference](chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase Runtime Reference](response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Response Overlay Utility Contract Reference](response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
- [Renderer Overlay Tool Ghost Docs Hub](tool_ghost/README.md)
- [Tool Ghost Debug Cursor Payload and Timing Reference](tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Renderer Tool-Ghost Lifecycle Docs Hub](tool_ghost/lifecycle/README.md)
- [Tool Ghost Debug Lifecycle and Timer Reference](tool_ghost/lifecycle/tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Debug Track Style and CSS Class Contract Reference](tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)

## Code Scope

- `frontend/src/renderer/app/MinimalChatPillApp.jsx`
- `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`
- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`
