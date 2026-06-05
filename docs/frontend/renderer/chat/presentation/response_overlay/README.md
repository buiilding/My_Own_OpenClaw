---
summary: "Renderer chat response-overlay presentation docs sub-hub for fixed response-pill sizing, scroll/visibility contracts, and debug-only tool-ghost cursor markup semantics."
read_when:
  - When changing `MinimalResponseOverlay.jsx` response-pill sizing, scroll anchoring, or visibility re-report behavior.
  - When changing `ToolGhostCursor`/`ToolGhostDebugApp` debug animation markup and classes in `ChatBoxResponseOverlay.css`.
  - When debugging clipped response content, stale overlay dimensions after hide/show cycles, or debug ghost-cursor label rendering.
title: "Renderer Chat Response-Overlay Presentation Docs Hub"
---

# Renderer Chat Response-Overlay Presentation Docs Hub

## Deep Pages

- [Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference](fixed_response_pill_height_scroll_and_visibility_rereport_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)

## Related Pages

- [Renderer Chat Presentation Docs Hub](../README.md)
- [Renderer Overlay Tool Ghost Docs Hub](../../../overlays/tool_ghost/README.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](../../../overlays/tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](../../../overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)

## Code Scope

- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/ChatBoxResponse.testUtils.jsx`
