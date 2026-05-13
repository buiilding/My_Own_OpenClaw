---
summary: "Linux WindieOS platform guide for overlay screenshot capture, content protection, app packaging, sudo policy, and sidecar platform behavior."
read_when:
  - When changing Linux screenshot capture behavior, overlay visibility, packaging, sudo access, or platform adapters.
title: "Linux"
---

# Linux

Linux is the only platform where WindieOS should hide overlay surfaces for screenshot capture and restore them after capture. This exists to avoid capturing the minimal chat pill or response overlay in tool screenshots.

## Key Areas

- Linux overlay screenshot guard: `frontend/src/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md`
- Main overlay/window code: `frontend/src/main/overlay_*`, `frontend/src/main/window_visibility_runtime.cjs`
- Sidecar adapter: `frontend/src/main/python/core/platform/linux.py`
- Content protection runtime: `frontend/src/main/platform/content_protection/linux.cjs`
- Sudo access handler: `frontend/src/main/agent_sudo_access_handler_pkexec_and_noninteractive_disable_contract_reference.md`
- Package target: `frontend/package.json` `package:linux`
- Reinstall helper: `scripts/reinstall-windieos-linux.sh`

## Rules

- Hide WindieOS overlay surfaces before screenshot capture and restore them after capture.
- Use the hide-only collapse path for minimal pill screenshot timing; do not pre-hide with a show path.
- Keep the awaiting indicator latched through transient `idle` until streaming, completion, error, or visible response content clears it.
- Keep sudo grant/revoke behavior explicit and non-interactive disable behavior documented.
- Verify `xdotool` or `ydotool` availability before editing window-switching or input-control behavior.
- Treat AppImage dependency gaps separately from DEB/RPM package dependency metadata.

## Related Docs

- [Frontend Linux Screenshot Window Hide and Restore Guard Reference](../frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Window and Input Matrix](window_input_matrix.md)
- [Packaging Runtime Matrix](packaging_runtime_matrix.md)
- [Packaged Desktop Builds](../install/packaged_desktop.md)
