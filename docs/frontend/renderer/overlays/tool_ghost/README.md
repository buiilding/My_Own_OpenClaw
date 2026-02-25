---
summary: "Renderer overlay tool-ghost docs sub-hub for payload parsing, target mapping, and click animation synchronization behavior."
read_when:
  - When changing response-overlay tool ghost rendering or tool-call preview payload parsing.
  - When debugging missing ghost target coordinates, label fallback behavior, or click animation timing mismatch.
title: "Renderer Overlay Tool Ghost Docs Hub"
---

# Renderer Overlay Tool Ghost Docs Hub

## Deep Pages

- [Tool Ghost Preview Payload Parsing and Target Mapping Reference](tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Renderer Tool-Ghost Lifecycle Docs Hub](lifecycle/README.md)
- [Tool Ghost Lifecycle System-State Sampling, Target Resolution, and Click Hide-Timer Reference](lifecycle/tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)

## Related Pages

- [Frontend Renderer Overlay Docs Hub](../README.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/components/useToolGhostLifecycle.js`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/components/chatBoxResponseUtils.js`
- `frontend/src/renderer/features/chat/utils/toolGhostPreview.js`
- `frontend/src/renderer/features/chat/constants/toolGhostRuntime.ts`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`
- `tests/frontend/ChatBoxResponse.toolGhost.test.jsx`
- `tests/frontend/ChatBoxResponse.testUtils.jsx`
- `tests/frontend/ToolGhostPreview.test.js`
