---
summary: "Cross-platform permission matrix for WindieOS screen capture, input control, microphone, System Events automation, browser automation, workspace access, and shell execution."
read_when:
  - When changing permission probes, onboarding visibility, grant actions, or platform-specific permission messaging.
  - When debugging why a permission appears, is required, opens the wrong settings pane, or reports granted/needs-action incorrectly on macOS, Windows, or Linux.
title: "Platform Permission Matrix"
---

# Platform Permission Matrix

Permission behavior is owned by Electron main permission services and rendered as normalized permission state. Do not hard-code OS permission behavior in renderer components.

## Owner Map

| Concern | Owner files |
| --- | --- |
| permission manifest filtering and onboarding visibility | `frontend/src/main/permissions/permission_service_runtime.cjs`, `frontend/src/shared/permissions/permission_manifest.json` |
| screen capture probe/request | `frontend/src/main/permissions/permission_service_screen_capture.cjs` |
| input control/accessibility probe/request | `frontend/src/main/permissions/permission_service_input_control.cjs` |
| microphone probe/request | `frontend/src/main/permissions/permission_service_microphone.cjs` |
| macOS System Events automation | `frontend/src/main/permissions/permission_service_automation.cjs`, `frontend/src/main/python/core/platform/macos_automation_permission.py` |
| browser automation checks | `frontend/src/main/permissions/permission_service_browser.cjs` |
| workspace and shell permission state | `frontend/src/main/permissions/permission_service_workspace.cjs`, `frontend/src/main/permissions/permission_state_store.cjs` |
| renderer presentation | `frontend/src/renderer/features/settings`, `frontend/src/renderer/features/onboarding` |

## Permission Behavior

| Permission | macOS | Windows | Linux |
| --- | --- | --- | --- |
| screen capture | required; probes `systemPreferences.getMediaAccessStatus('screen')`; request first triggers real desktop capture so macOS registers the app in Screen Recording | settings-visible; verifies desktop capture capability directly | settings-visible; verifies desktop capture capability directly |
| input control/accessibility | required; uses `systemPreferences.isTrustedAccessibilityClient` | settings-visible; verifies cursor access through PowerShell/.NET | settings-visible; checks GNOME accessibility, X11 plus `xdotool`, or `ydotool` |
| microphone | optional in onboarding; uses `getMediaAccessStatus('microphone')` plus native/renderer prompt fallback | settings-visible; checks Windows microphone consent registry values | settings-visible; checks PipeWire/PulseAudio source availability |
| System Events automation | macOS-only required permission; probes Apple Events permission to control System Events | unsupported | unsupported |
| browser automation | optional; probes browser/runtime availability | optional; probes browser/runtime availability | optional; probes browser/runtime availability |
| filesystem workspace access | required app-level state; path access is stored in permission state | required app-level state | required app-level state |
| shell execution | settings-visible; app-level risk gate | settings-visible; app-level risk gate | settings-visible; app-level risk gate plus sudo/pkexec flows when enabled |

## Onboarding Visibility Rules

The runtime maps manifest entries to platform-specific onboarding visibility:

- `screen_capture` and `input_control_accessibility`: required on macOS, settings-only on Windows/Linux.
- `system_events_automation` and `filesystem_workspace_access`: required when applicable.
- `microphone`: optional on macOS, settings-only on Windows/Linux.
- `browser_automation`: optional.
- `shell_execution`: settings-only.

If visibility changes, update the manifest/runtime tests and user-facing settings docs together.

## Debug Route

1. Confirm the permission exists in `permission_manifest.json`.
2. Confirm `permissionAppliesToPlatform` and `resolveOnboardingVisibility` keep it visible for the current OS.
3. Check the probe function for the platform.
4. Check whether request uses a native prompt, settings URL, command probe, or app-level state.
5. Confirm renderer consumes the normalized `granted`, `status`, `reason`, and `details` payload rather than inferring OS state locally.

## Related Docs

- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Security Boundary Matrix](../security/security_boundary_matrix.md)
- [macOS](macos.md)
- [Windows](windows.md)
- [Linux](linux.md)
