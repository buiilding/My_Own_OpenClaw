---
summary: "Cross-platform screenshot, overlay visibility, and content-protection policy for WindieOS chat pill, response overlay, and tool screenshots."
read_when:
  - When changing screenshot capture, response overlay phases, chat pill visibility, content protection, or capture-time window policy.
  - When debugging overlay flicker, screenshots that include WindieOS UI, focus steals, or platform-specific content-protection regressions.
title: "Screenshot and Overlay Policy"
---

# Screenshot and Overlay Policy

Screenshot and overlay behavior is platform-specific because Electron content protection and compositor behavior differ by OS. Keep capture policy in Electron main and orchestrator code, not in ad hoc renderer UI effects.

## Policy Matrix

| Behavior | macOS | Windows | Linux |
| --- | --- | --- | --- |
| hide WindieOS overlays for screenshot capture | no | no | yes, through the shared Linux hide/restore contract |
| use Electron `setContentProtection` | yes, during active loop phases only | yes, during active loop phases only | no; Linux uses hide/restore instead |
| content protection idle behavior | disabled in idle and terminal phases | disabled in idle and terminal phases | no-op |
| minimal chat pill capture behavior | no capture-time hide/show | no capture-time hide/show | hide-only collapse path; restore after capture |
| response overlay capture behavior | protected rather than hidden | protected rather than hidden | hidden/restored with overlay surfaces when required |
| focus recovery after capture | do not add renderer refocus hacks | do not add renderer refocus hacks | restore visibility without focus steal |

Active loop phases are:

- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`

Terminal or idle phases should not keep content protection enabled.

## Owner Files

| Concern | Files |
| --- | --- |
| platform content protection dispatch | `frontend/src/main/window_platform_policy.cjs`, `frontend/src/main/platform/content_protection/*` |
| screenshot visibility runtime dispatch | `frontend/src/main/local_backend_bridge_window_visibility.cjs`, `frontend/src/main/platform/screenshot_window_visibility/*` |
| overlay phase IPC | `frontend/src/main/overlay_phase_ipc_runtime.cjs`, `frontend/src/main/response_overlay_phase_handler.cjs` |
| renderer surface orchestration | `frontend/src/renderer/features/overlays`, `tests/frontend/SurfaceOrchestratorCaptureLifecycle.test.ts` |
| Linux guard reference | `docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md` |

## Linux-Specific Contract

Linux is the only OS where WindieOS overlay surfaces should be hidden for screenshot capture. The current platform runtime delegates Linux hide/show to the renderer SurfaceOrchestrator so capture uses one deterministic collapse/restore path.

Rules:

- hide the chat pill before screenshot capture
- keep chat pill and response overlay non-focusable during the loop
- restore chat pill visibility after capture
- do not use a pre-hide show path
- do not animate awaiting-to-response transitions in the minimal pill loop
- keep the awaiting indicator latched through transient `idle`

## macOS and Windows Contract

macOS and Windows should not add capture-time hide/show for the minimal chat pill or response overlay. They rely on content protection during active loop phases and must disable it again once the loop is idle, complete, or errored.

Rules:

- no renderer hide/show collapse path for capture
- no focus-restoration hacks in renderer chat-pill runtime
- content protection belongs in Electron main platform policy
- overlay phase drives interactivity and protection state

## Validation

Use focused tests when changing capture or overlay policy:

- `tests/frontend/SurfaceOrchestratorCaptureLifecycle.test.ts`
- `tests/frontend/ResponseOverlayPhaseHandler.test.cjs`
- `tests/frontend/IpcMainBridge*.test.cjs`
- platform-specific window policy tests when adding a new owner

## Related Docs

- [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md)
- [Frontend Runtime Invariants and PR Checklist](../frontend/runtime/frontend_runtime_invariants_checklist.md)
- [Minimal Chat Pill](../desktop/minimal_chat_pill.md)
- [Response Overlay](../desktop/response_overlay.md)
- [Linux](linux.md)
- [macOS](macos.md)
- [Windows](windows.md)
