---
summary: "macOS WindieOS platform guide for permissions, screen capture, input control, packaging, signing, and local reinstall behavior."
read_when:
  - When changing macOS permissions, packaged app behavior, local reinstall, signing, or overlay capture policy.
title: "macOS"
---

# macOS

macOS behavior is shaped by TCC permissions, Screen Recording registration, microphone capture, input automation, ad-hoc local signing, and packaged app constraints.

## Key Areas

- Permission probes and requests: `frontend/src/main/permissions/permission_service*.cjs`
- macOS local-runtime platform adapter: `frontend/src/main/python/core/platform/macos.py`
- macOS automation permission helper: `frontend/src/main/python/core/platform/macos_automation_permission.py`
- Local reinstall helper: `<windie> reinstall mac`
- Package entitlements: `frontend/src/main/assets/macos/entitlements.mac.plist`

## Rules

- Do not hide/show minimal chat pill or response overlay for screenshot capture on macOS.
- Content protection should be enabled only during active loop phases and disabled in idle/terminal phases.
- Local reinstall loops should skip Apple notarization.
- Permission UI should probe real OS capability instead of treating settings navigation as success.
- Accessibility and System Events automation failures are permission failures until proven otherwise.
- Packaged runtime checks must include local-runtime startup, microphone/screen prompt behavior, and installed-app path behavior.

## Related Docs

- [Permission Onboarding Gate](../frontend/renderer/permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [Frontend Overlay Query-Capture Blur + Settle](../frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Window and Input Matrix](window_input_matrix.md)
- [Packaging Runtime Matrix](packaging_runtime_matrix.md)
- [Packaged Desktop Builds](../install/packaged_desktop.md)
