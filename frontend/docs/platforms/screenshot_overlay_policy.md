---
summary: "Cross-platform screenshot, overlay visibility, and content-protection policy for desktop chat pill, response overlay, and tool screenshots."
read_when:
  - When changing screenshot capture, response overlay phases, chat pill visibility, content protection, or capture-time window policy.
  - When debugging overlay flicker, screenshots that include desktop overlay UI, focus steals, or platform-specific content-protection regressions.
title: "Screenshot and Overlay Policy"
---

# Screenshot and Overlay Policy

Screenshot and overlay behavior is platform-specific because Electron content protection and compositor behavior differ by OS. Keep capture policy in Electron main and orchestrator code, not in ad hoc renderer UI effects.

## Policy Matrix

| Behavior | macOS | Windows | Linux |
| --- | --- | --- | --- |
| hide desktop overlay surfaces for screenshot capture | no | no | yes, through the shared Linux hide/restore contract |
| use Electron `setContentProtection` | yes, during SDK screenshot-capture leases only | yes, during SDK screenshot-capture leases only | no; Linux uses hide/restore instead |
| content protection idle behavior | disabled outside screenshot-capture leases | disabled outside screenshot-capture leases | no-op |
| minimal chat pill capture behavior | no capture-time hide/show | no capture-time hide/show | hide-only collapse path; restore after capture |
| response overlay capture behavior | protected rather than hidden | protected rather than hidden | hidden/restored with overlay surfaces when required |
| focus recovery after capture | do not add renderer refocus hacks | do not add renderer refocus hacks | restore visibility without focus steal |

Normal macOS and Windows overlay windows must remain capturable by user-initiated
system screenshots. Screenshot exclusion is not an active-loop state; it is a
short lease around SDK-local screenshot execution:

1. SDK calls Electron's local tool lifecycle immediately before `screenshot`.
2. Electron main enables content protection for desktop overlay windows.
3. The local-runtime screenshot task runs.
4. Electron main disables content protection in the release callback.

## Owner Files

| Concern | Files |
| --- | --- |
| platform content protection dispatch | `frontend/src/main/surfaces/window_platform_policy.cjs`, `frontend/src/main/platform/content_protection/{index,supported}.cjs` |
| screenshot visibility task seam | `frontend/src/main/sidecar/local_runtime_window_visibility.cjs` |
| overlay phase IPC | `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`, `frontend/src/main/surfaces/response_overlay_phase_handler.cjs` |
| Linux guard reference | `docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md` |

## Linux-Specific Contract

Linux is the only OS where desktop overlay surfaces may need hide/restore for SDK-local screenshot capture. That policy belongs to Electron main's local tool lifecycle and platform screenshot visibility bridge, not renderer surface orchestration.

Rules:

- hide the chat pill before screenshot capture
- keep chat pill and response overlay non-focusable during the loop
- restore chat pill visibility after capture
- restore a screenshot-suppressed dashboard to its saved bounds before applying
  implicit stored display affinity; only an explicit target display move should
  discard the saved screenshot bounds
- do not use a pre-hide show path
- do not animate awaiting-to-response transitions in the minimal pill loop
- keep the awaiting indicator latched through transient `idle`

## macOS and Windows Contract

macOS and Windows should not add capture-time hide/show for the minimal chat pill
or response overlay. They rely on content protection during the SDK screenshot
lease and must disable it immediately after capture.

Rules:

- no renderer hide/show collapse path for capture on any platform
- no focus-restoration hacks in renderer chat-pill runtime
- content protection belongs in Electron main platform policy
- overlay phase does not own screenshot invisibility

## Validation

Use focused tests when changing capture or overlay policy:

- `tests/frontend/LocalRuntimeWindowVisibility.test.cjs`
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
