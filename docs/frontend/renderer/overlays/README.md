---
summary: "Frontend renderer overlay docs sub-hub for chatbox input-pill behavior, response overlay state machine, and tool-ghost preview rendering internals."
read_when:
  - When changing chatbox/response overlay renderer components or overlay phase listeners.
  - When debugging click-through behavior, drag/resize IPC, or tool-call ghost preview positioning.
title: "Frontend Renderer Overlay Docs Hub"
---

# Frontend Renderer Overlay Docs Hub

## Deep Pages

- [Chatbox Overlay Input, Drag, and Click-Through Reference](chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Renderer Overlay Tool Ghost Docs Hub](tool_ghost/README.md)
- [Tool Ghost Preview Payload Parsing and Target Mapping Reference](tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)

## Code Scope

- `frontend/src/renderer/app/ChatBoxApp.jsx`
- `frontend/src/renderer/app/ChatBoxResponseApp.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/utils/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/overlayFrameSize.js`
- `frontend/src/renderer/features/chat/utils/toolGhostPreview.js`
