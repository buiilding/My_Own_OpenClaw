---
summary: "Frontend renderer styles docs sub-hub for global theme/accessibility CSS variables, dashboard/chat/voice visual contracts, and component-class coupling."
read_when:
  - When changing renderer CSS files under `frontend/src/renderer/styles/*`.
  - When debugging visual regressions caused by class-token mismatches between JSX and style modules.
title: "Frontend Renderer Styles Docs Hub"
---

# Frontend Renderer Styles Docs Hub

## Deep Pages

- [Global Theme, Accessibility Utility, and Dashboard Shell Visual Contract Reference](global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md)
- [Chat Interface and Thinking Stream Style Contract Reference](chat_interface_thinking_stream_and_token_count_style_contract_reference.md)
- [Voice Status Visual State Style Contract Reference](voice_status_visual_state_style_contract_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Renderer Chat Presentation Docs Hub](../chat/presentation/README.md)
- [Renderer Voice Components Docs Hub](../voice/components/README.md)

## Code Scope

- `frontend/src/renderer/styles/theme.css`
- `frontend/src/renderer/styles/accessibility.css`
- `frontend/src/renderer/styles/ChatBox.css`
- `frontend/src/renderer/styles/ChatBoxResponseOverlay.css`
- `frontend/src/renderer/styles/DashboardShell.css`
- `frontend/src/renderer/styles/ChatInterface.css`
- `frontend/src/renderer/styles/DashboardPanelSurfaces.css`
- `frontend/src/renderer/styles/SettingsSurface.css`
- `frontend/src/renderer/styles/ErrorBoundary.css`
- `frontend/src/renderer/styles/DesktopOnboarding.css`
- `frontend/src/renderer/styles/ThinkingDisplay.css`
- `frontend/src/renderer/styles/VoiceStatus.css`
- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/MinimalChatPillApp.jsx`
- `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx`
- `frontend/src/renderer/app/ToolGhostDebugApp.jsx`
- `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/message/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`
