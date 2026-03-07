---
summary: "Frontend renderer overlay docs sub-hub for chatbox input-pill behavior, response overlay phase handling, and residual tool-ghost debug harness references."
read_when:
  - When changing chatbox/response overlay renderer components or overlay phase listeners.
  - When debugging click-through behavior, drag/resize IPC, or response overlay sizing/visibility.
title: "Frontend Renderer Overlay Docs Hub"
---

# Frontend Renderer Overlay Docs Hub

## Deep Pages

- [Chatbox Overlay Input, Drag, and Click-Through Reference](chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase Runtime Reference](response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Overlay Phase Listener and Sync-Store Contract Reference](overlay_phase_listener_and_sync_external_store_contract_reference.md)
- [Response Overlay Utility Contract Reference](response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
- [Renderer Overlay Tool Ghost Docs Hub](tool_ghost/README.md)
- [Tool Ghost Debug Cursor Payload and Timing Reference](tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Renderer Tool-Ghost Lifecycle Docs Hub](tool_ghost/lifecycle/README.md)
- [Tool Ghost Debug Lifecycle and Timer Reference](tool_ghost/lifecycle/tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Debug Track Style and CSS Class Contract Reference](tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)

## Code Scope

- `frontend/src/renderer/app/ChatBoxApp.jsx`
- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhasePayload.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayLayoutMode.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayFrameSize.js`
- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/constants/toolGhostRuntime.ts`
