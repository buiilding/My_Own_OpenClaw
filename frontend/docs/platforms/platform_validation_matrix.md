---
summary: "Validation matrix for WindieOS platform changes across permissions, screenshots, overlays, local input, display affinity, packaging, and installed-app smoke checks."
read_when:
  - When choosing tests for a macOS, Windows, or Linux platform change.
  - When validating a platform fix that touches Electron main, renderer overlays, local-runtime Python computer tools, permissions, or packaging scripts.
  - When collecting evidence for an OS-specific bug report.
title: "Platform Validation Matrix"
---

# Platform Validation Matrix

Use this matrix after choosing an owner in [Platform Change Workflow](platform_change_workflow.md). It turns platform changes into concrete validation commands and manual checks.

Docs-only changes can stop at docs validation. Behavior changes should run focused automated tests plus an OS-specific smoke check when the runtime behavior depends on the host compositor, permission service, package format, or installed-app path.

## Command Groups

| Scope | Command |
| --- | --- |
| docs index | `<windie> docs list` |
| docs whitespace and patch hygiene | `git diff --check` |
| frontend focused tests | `cd frontend && npm run test -- <pattern>` |
| frontend CI suite | `<windie> test frontend` |
| local-runtime Python focused tests | `./scripts/python-in-env local-runtime pytest <path>` |
| local-runtime Python suite | `<windie> test local-runtime` |
| bundled Python runtime build | `<windie> build local-runtime` |
| macOS package | `<windie> package mac` |
| Windows package | `<windie> package win` |
| Linux package | `<windie> package linux` |

## Automated Test Matrix

| Changed surface | Frontend tests | Local-runtime Python tests | Notes |
| --- | --- | --- | --- |
| content protection | `tests/frontend/WindowPlatformPolicy.test.cjs`, `tests/frontend/DisplayAffinityRuntime.test.cjs`, `tests/frontend/SurfaceRuntime.test.cjs` | not applicable | Covers Electron main policy and screenshot-capture leases; smoke screenshot capture on target OS when capture behavior changed. |
| screenshot visibility bridge | `tests/frontend/LocalRuntimeWindowVisibility.test.cjs` | `tests/sidecar/test_screenshot_tool.py` | Use when screenshots include desktop app surfaces or capture bounds are wrong. |
| overlay phase state | `tests/frontend/ResponseOverlayPhaseHandler.test.cjs`, `tests/frontend/OverlayPhaseIpcRuntime.test.cjs` | not applicable | Use when phase transitions change hide/protect/restore behavior. |
| display affinity and multi-monitor targeting | `tests/frontend/DisplayAffinityRuntime.test.cjs`, `tests/frontend/DisplayQueryHandler.test.cjs` | `tests/sidecar/test_screenshot_tool.py` | Include manual multi-monitor capture check if the bug was monitor-specific. |
| permission probe or grant | `tests/frontend/PermissionService.test.cjs`, `tests/frontend/PermissionIpcRuntime.test.cjs`, `tests/frontend/permissionStore.test.js` | platform-specific local-runtime Python tool test if execution depends on the grant | Use real OS manual checks for grant flows. Mocks only prove routing. |
| onboarding permission UI | `tests/frontend/useOnboardingPermissionActions.test.jsx`, `tests/frontend/AppPermissionGate.test.jsx`, `tests/frontend/permissionGrantEffects.test.js` | not applicable | Use with permission-service tests so UI and authority do not drift. |
| local-runtime Python mouse control | not applicable unless renderer tool dispatch changed | `tests/sidecar/test_mouse_tool.py` | Manual pointer movement may be required for OS-level confidence. |
| local-runtime Python keyboard control | not applicable unless renderer tool dispatch changed | `tests/sidecar/test_keyboard_tool.py` | Validate permission handling before changing key synthesis. |
| local-runtime Python scroll control | not applicable unless renderer tool dispatch changed | `tests/sidecar/test_scroll_tool.py`, `tests/sidecar/test_scroll_config.py` | Include app-focus manual check if scrolling target changed. |
| local-runtime Python window manager | not applicable unless UI consumes active-window labels | `tests/sidecar/test_macos_window_manager.py`, `tests/sidecar/test_windows_window_manager.py`, `tests/sidecar/test_linux_window_manager.py`, `tests/sidecar/test_platform_module_selection.py` | Keep platform module selection deterministic. |
| packaged bundled Python runtime | frontend package build and smoke helper | target OS local-runtime smoke through installed app | Source tests do not prove installed Python runtime isolation. |

## Manual Smoke Checks

| Surface | macOS | Windows | Linux |
| --- | --- | --- | --- |
| screenshot excludes desktop overlay UI | Send from minimal pill, verify the SDK screenshot tool does not show protected overlays. | Send from minimal pill, verify the SDK screenshot tool does not show protected overlays. | Send from minimal pill, verify overlays hide then restore without flicker. |
| content protection | Confirm protection is active only during SDK screenshot-capture leases and disabled after capture. | Confirm protection is active only during SDK screenshot-capture leases and disabled after capture. | Confirm content protection path is a no-op and Electron main hide/restore owns SDK-local screenshot capture. |
| screen capture permission | Reset or deny Screen Recording, run onboarding grant, verify native prompt or documented fallback. | Verify screenshot works without macOS-style permission flow. | Verify screenshot dependencies are present and failure text routes to Linux docs. |
| input control permission | Reset or deny Accessibility, run input probe, verify grant flow and mouse/keyboard tool behavior. | Run PowerShell cursor probe and a local mouse/keyboard smoke. | Verify GNOME accessibility, X11 `xdotool`, or `ydotool` route before editing tool logic. |
| window switching | Switch to a named app window and verify active-window label. | Switch to a named window and verify foreground wait. | Verify X11/Wayland expectation and ambiguous title handling. |
| packaged app | Install app, launch from `/Applications`, send prompt, run screenshot/local input tool. | Install NSIS app, launch from Start Menu, send prompt, run screenshot/local input tool. | Install AppImage/DEB/RPM target, send prompt, run screenshot/local input tool. |

## Evidence Packet

For OS-specific failures, collect enough evidence to separate policy bugs from environment bugs:

- OS name and version.
- package type or source/dev mode.
- whether the hosted backend endpoint is reachable.
- relevant permission status from onboarding/settings.
- Electron main log lines for permission, overlay, capture, or local-runtime startup.
- renderer console lines for surface orchestrator, overlay phase, or permission UI.
- local-runtime Python log lines for computer tool or window manager execution.
- exact command or user flow that triggered the failure.
- screenshot or short screen recording when the issue is visual.
- focused tests run and the first failing assertion.

Use [Evidence Packet](../help/evidence_packet.md) for a full handoff template.

## Platform-Specific Dependencies

| Dependency | macOS | Windows | Linux |
| --- | --- | --- | --- |
| screenshot capture | Screen Recording permission, Pillow capture path, display affinity | Win32/GDI cursor capture path, Pillow fallback where applicable | X11/Wayland-dependent capture path, compositor behavior, optional tool dependencies |
| local input | Accessibility permission | PowerShell/.NET probe and Win32 foreground behavior | GNOME accessibility, X11 `xdotool`, or `ydotool` |
| window manager | AppKit/ApplicationServices | `user32` through `ctypes` | `xdotool` and session type |
| packaging | DMG/ZIP, signing/notarization for release, ad-hoc signing for local reinstall | NSIS installer, PowerShell reinstall helper | AppImage/DEB/RPM, distro-level dependencies |

## When to Broaden Validation

Run broader validation when:

- a shared helper changed under `frontend/src/main/platform`.
- a permission manifest or IPC channel changed.
- local-runtime Python tool payloads or result shapes changed.
- packaged runtime search paths changed.
- the change touches both renderer state and Electron native window behavior.
- a failure could corrupt transcript, tool-result, or artifact state.

Suggested broader checks:

- `<windie> test frontend`
- `<windie> test local-runtime`
- `<windie> test backend` when backend tool schemas, OCR/vision, or hosted route payloads changed
- target OS package build and smoke helper when installed-app behavior changed

## Related Docs

- [Platform Change Workflow](platform_change_workflow.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Window and Input Matrix](window_input_matrix.md)
- [Packaging Runtime Matrix](packaging_runtime_matrix.md)
- [Doctor Checklist](../help/doctor_checklist.md)
- Evidence Collection Runbook (private backend docs)
