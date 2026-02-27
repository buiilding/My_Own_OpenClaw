---
summary: "Renderer chat response-overlay presentation docs sub-hub for response-pill auto-resize contracts and debug-only tool-ghost cursor markup semantics."
read_when:
  - When changing `ChatBoxResponse.jsx` response-pill sizing behavior.
  - When changing `ToolGhostCursor`/`ToolGhostDebugApp` debug animation markup and classes in `ChatBoxResponseOverlay.css`.
  - When debugging clipped response content, resize jitter, or debug ghost-cursor label rendering.
title: "Renderer Chat Response-Overlay Presentation Docs Hub"
---

# Renderer Chat Response-Overlay Presentation Docs Hub

## Deep Pages

- [Auto-Resized Response Height ResizeObserver and Clamp Contract Reference](auto_resized_response_height_resizeobserver_and_clamp_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)

## Related Pages

- [Renderer Chat Presentation Docs Hub](../README.md)
- [Renderer Overlay Tool Ghost Docs Hub](../../../../overlays/tool_ghost/README.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](../../../../overlays/tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../../../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/hooks/useAutoResizedResponseHeight.js`
- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/ChatBoxResponse.testUtils.jsx`
