---
summary: "Cross-platform window and input-control matrix for WindieOS active-window detection, window switching, overlay policy, and local input automation dependencies."
read_when:
  - When changing active-window detection, window switching, input control, overlay topmost policy, or local computer-use behavior.
  - When debugging platform-specific failures in window listing, active-window context, focus, keyboard/mouse control, or overlay layering.
title: "Window and Input Matrix"
---

# Window and Input Matrix

Window and input behavior spans Electron main and the local runtime. Electron owns desktop app windows and overlay policy. The local runtime owns host-window discovery and local input/tool execution through the current local-runtime Python implementation.

## Owner Map

| Concern | Owner files |
| --- | --- |
| desktop app BrowserWindow policy | `frontend/src/main/surfaces/window_platform_policy.cjs`, `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/main/overlay_*` |
| overlay topmost/all-workspaces behavior | `frontend/src/main/surfaces/overlay_topmost_runtime.cjs`, `frontend/src/main/surfaces/surface_window_options_runtime.cjs` |
| local-runtime platform abstraction | `frontend/src/main/python/core/platform/__init__.py`, `base.py` |
| macOS window management | `frontend/src/main/python/core/platform/macos.py` |
| Windows window management | `frontend/src/main/python/core/platform/windows.py` |
| Linux window management | `frontend/src/main/python/core/platform/linux.py` |
| input-control permission | `frontend/src/main/permissions/permission_service_input_control.cjs` |
| computer tools | `frontend/src/main/python/tools/computer`, `docs/tools/computer.md` |

## Platform Dependencies

| Platform | Window listing/switching | Input-control probe | Common failure |
| --- | --- | --- | --- |
| macOS | AppKit, ApplicationServices Accessibility APIs, Quartz | Accessibility trust through `systemPreferences.isTrustedAccessibilityClient` | Accessibility not granted; AppKit/ApplicationServices unavailable in packaged runtime |
| Windows | Win32 `user32` APIs through `ctypes` | PowerShell/.NET cursor probe | foreground-window wait fails or PowerShell blocked |
| Linux | `xdotool` for visible windows and active window name | GNOME accessibility, X11 with `xdotool`, or `ydotool` | Wayland/X11 differences, missing `xdotool`, ambiguous window title match |

## Routing Rules

- Keep app-owned window visibility, focusability, content protection, and
  all-workspaces policy in Electron main.
- Keep host-application window discovery and switching in local-runtime
  platform adapters.
- Renderer should consume normalized active-window/context state.
- Do not add OS-specific subprocess calls in React components.
- Do not make a local-runtime platform adapter depend on backend code.

## Debug Checklist

1. Confirm the failing operation is app-owned window policy or host-window control.
2. For desktop app windows, inspect Electron main logs and platform policy modules.
3. For host-window discovery, run the local-runtime Python platform tests or a focused local-runtime Python shell probe.
4. On Linux, verify `xdotool` or `ydotool` availability before editing fuzzy match logic.
5. On macOS, verify Accessibility and System Events permissions before editing AppKit code.
6. On Windows, verify the PowerShell probe and foreground-window wait behavior before changing local-runtime Python switching logic.

## Related Docs

- [Computer Tools](../tools/computer.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Desktop and Local Runtime Node](../nodes/desktop_and_sidecar_node.md)
- [Local-Runtime Python Implementation](../architecture/python_sidecar.md)
