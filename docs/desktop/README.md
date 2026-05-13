---
summary: "Desktop surfaces hub for WindieOS dashboard, chat pill, response overlay, onboarding, permissions, voice, and artifact-backed attachments."
read_when:
  - When changing user-visible desktop surfaces.
  - When deciding whether a feature belongs in dashboard, chat pill, response overlay, onboarding, settings, or voice code.
title: "Desktop Surfaces"
---

# Desktop Surfaces

WindieOS is not only a chat UI. It is a set of desktop surfaces coordinated by Electron main and React renderer roots.

## Surface Pages

- [Dashboard](dashboard.md)
- [Minimal Chat Pill](minimal_chat_pill.md)
- [Response Overlay](response_overlay.md)
- [Onboarding and Permissions](onboarding_permissions.md)
- [Voice and Wakeword](voice_and_wakeword.md)
- [Artifacts and Attachments](artifacts_and_attachments.md)

## Renderer Entrypoints

| Surface | Entrypoint | Primary components |
| --- | --- | --- |
| Dashboard | `frontend/src/renderer/app/App.jsx` | `DashboardShell`, `DashboardSidebar`, chat/settings/memory sections |
| Chat pill | `frontend/src/renderer/app/ChatBoxApp.jsx` | `ChatBox`, `MessageInput`, attachment previews |
| Response overlay | `frontend/src/renderer/app/ChatBoxResponseApp.jsx` | `ChatBoxResponse`, response overlay hooks |
| Context label | `frontend/src/renderer/app/ChatBoxContextLabelApp.jsx` | `ChatBoxContextLabel` |
| Onboarding | `frontend/src/renderer/features/onboarding/*` | `FrontendOnboardingSlideshow`, permission slides |
| Voice/wakeword | `frontend/src/renderer/app/WakewordController.jsx`, `features/voice/*` | wakeword and voice-mode hooks |

## Main Process Owners

- Window creation and overlay bootstrap: `frontend/src/main/main_window_runtime.cjs`
- Window visibility and surface routing: `frontend/src/main/window_visibility_runtime.cjs`, `frontend/src/main/surface_runtime.cjs`
- Overlay phase and top-most behavior: `frontend/src/main/overlay_*`, `frontend/src/main/response_overlay_phase_handler.cjs`
- Permission IPC/runtime: `frontend/src/main/permission_*`
- Wakeword bridge: `frontend/src/main/wakeword_bridge*.cjs`

## Rule

Keep product-surface behavior separated from transport and local execution. UI state belongs in renderer/app providers and feature stores; window/permission/process behavior belongs in Electron main; local tool execution belongs in the Python sidecar.
