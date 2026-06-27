---
summary: "Desktop shell surfaces hub for dashboard, chat pill, response overlay, onboarding, permissions, voice, and artifact-backed attachments."
read_when:
  - When changing user-visible desktop shell surfaces.
  - When deciding whether a feature belongs in dashboard, chat pill, response overlay, onboarding, settings, or voice code.
title: "Desktop Surfaces"
---

# Desktop Surfaces

The desktop runtime is not only a chat UI. It is a set of desktop surfaces coordinated by Electron main and React renderer roots.

## Surface Pages

- [Dashboard](dashboard.md)
- [Minimal Chat Pill](minimal_chat_pill.md)
- [Response Overlay](response_overlay.md)
- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Onboarding and Permissions](onboarding_permissions.md)
- [Voice and Wakeword](voice_and_wakeword.md)
- [Artifact Change Workflow](artifact_change_workflow.md)
- [Artifacts and Attachments](artifacts_and_attachments.md)

## Renderer Entrypoints

| Surface | Entrypoint | Primary components |
| --- | --- | --- |
| Dashboard | `frontend/src/renderer/app/App.jsx` | `DashboardShell`, `DashboardSidebar`, chat/settings/memory sections |
| Chat pill | `frontend/src/renderer/app/MinimalChatPillApp.jsx` | `MinimalChatPill`, `MessageInput`, attachment previews |
| Response overlay | `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx` | `MinimalResponseOverlay`, response overlay hooks |
| Onboarding | `frontend/src/renderer/features/onboarding/*` | `DesktopOnboardingSlideshow`, permission slides |
| Voice/wakeword | `frontend/src/renderer/app/WakewordController.jsx`, `features/voice/*` | wakeword and voice-mode hooks |

## Main Process Owners

- Window creation and overlay bootstrap: `frontend/src/main/surfaces/main_window_runtime.cjs`
- Window visibility and surface routing: `frontend/src/main/surfaces/window_visibility_runtime.cjs`, `frontend/src/main/surfaces/surface_runtime.cjs`
- Overlay phase and top-most behavior: `frontend/src/main/overlay_*`, `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`
- Permission IPC/runtime: `frontend/src/main/permission_*`
- Wakeword bridge: `frontend/src/main/wakeword/wakeword_bridge*.cjs`

## Rule

Keep product-surface behavior separated from transport and local execution. UI state belongs in renderer/app providers and feature stores; window/permission/process behavior belongs in Electron main; local tool execution is reached through the SDK local-runtime contract and implemented by local-runtime Python.
