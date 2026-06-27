---
summary: "Workflow for platform-specific WindieOS changes across macOS, Windows, Linux permissions, overlays, screenshots, input control, packaging, and local-runtime adapters."
read_when:
  - When changing OS-specific screenshot, overlay, permission, window, input,
    packaging, or local-runtime platform behavior.
  - When a bug reproduces on only one operating system.
  - When deciding whether a platform fix belongs in Electron main, renderer,
    local-runtime implementation, packaging scripts, or hosted backend code.
title: "Platform Change Workflow"
---

# Platform Change Workflow

Use this workflow before editing platform behavior. WindieOS platform bugs often look like UI bugs, tool bugs, or install bugs, but the owner is usually one of four places:

- Electron main window policy for app-owned windows and overlays.
- Local-runtime platform adapters for host OS window discovery and local input
  execution.
- Permission services for OS authority probes and grant flows.
- Packaging scripts and smoke helpers for installed-app runtime behavior.

Do not route platform fixes through the hosted backend. The backend can own
model policy, OCR, vision, and tool schemas, but it cannot own local OS
permissions, Electron window capture policy, or local-runtime process
packaging.

## Fast Owner Map

| Symptom or request | First owner | Source roots | Start docs | Focused tests |
| --- | --- | --- | --- | --- |
| Desktop overlay UI appears in screenshots | Electron main screenshot visibility and content protection | `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`, `frontend/src/main/platform/content_protection`, SDK/main screenshot resource handling | [Screenshot and Overlay Policy](screenshot_overlay_policy.md) | `tests/frontend/LocalRuntimeWindowVisibility.test.cjs`, `tests/frontend/WindowPlatformPolicy.test.cjs` |
| Linux chat pill flickers during capture | Electron main screenshot seam and surface runtime | `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`, `frontend/src/main/surfaces/surface_runtime.cjs` | [Screenshot and Overlay Policy](screenshot_overlay_policy.md), [Linux](linux.md) | `tests/frontend/LocalRuntimeWindowVisibility.test.cjs`, `tests/frontend/ResponseOverlayPhaseHandler.test.cjs` |
| macOS or Windows content protection remains active while idle | Electron main content-protection policy | `frontend/src/main/surfaces/window_platform_policy.cjs`, `frontend/src/main/platform/content_protection/*`, `frontend/src/main/surfaces/response_overlay_phase_handler.cjs` | [Screenshot and Overlay Policy](screenshot_overlay_policy.md) | `tests/frontend/DisplayAffinityRuntime.test.cjs`, `tests/frontend/WindowPlatformPolicy.test.cjs`, `tests/frontend/ResponseOverlayPhaseHandler.test.cjs` |
| Permission row is wrong or grant opens the wrong OS pane | Electron permission service and renderer permission UI | `frontend/src/main/permissions/permission_service*.cjs`, `frontend/src/renderer/features/onboarding`, `frontend/src/renderer/features/permissions` | [Platform Permission Matrix](permission_matrix.md), [Onboarding and Permissions](../desktop/onboarding_permissions.md) | `tests/frontend/PermissionService.test.cjs`, `tests/frontend/PermissionIpcRuntime.test.cjs`, `tests/frontend/useOnboardingPermissionActions.test.jsx` |
| Mouse, keyboard, scroll, screenshot, or window switching fails on one OS | Local-runtime Python computer tools and platform adapter | `frontend/src/main/python/tools/computer`, `frontend/src/main/python/core/platform` | [Window and Input Matrix](window_input_matrix.md), [Computer Tools](../tools/computer.md) | `tests/sidecar/test_mouse_tool.py`, `tests/sidecar/test_keyboard_tool.py`, `tests/sidecar/test_scroll_tool.py`, `tests/sidecar/test_screenshot_tool.py`, `tests/sidecar/test_*_window_manager.py` |
| Installed app cannot start local runtime or loses Python dependencies | Packaging scripts and bundled Python runtime build | `scripts/build-sidecar-runtime`, `frontend/package.json`, `frontend/electron-builder.*`, `frontend/src/main/python/requirements.runtime.txt` | [Packaging Runtime Matrix](packaging_runtime_matrix.md), [Bundled Python Runtime Packaging](../operations/sidecar_runtime_packaging.md) | `<windie> build local-runtime`, package smoke helper for the target OS |
| Reinstall loop preserves stale permissions or app data | OS reinstall helper and reset docs | `<windie> reinstall mac`, `<windie> reinstall linux`, `<windie> reinstall win` | [Uninstall, Reinstall, and Reset](../install/uninstall_reinstall_reset.md) | target OS reinstall helper plus manual permission reset check |
| Display selection, multi-monitor capture, or bounds are wrong | Electron display affinity and local-runtime screenshot capture | `frontend/src/main/surfaces/display_affinity_runtime.cjs`, `frontend/src/main/python/tools/computer/screenshot_tool.py` | [Window and Input Matrix](window_input_matrix.md), [Screenshot and Overlay Policy](screenshot_overlay_policy.md) | `tests/frontend/DisplayAffinityRuntime.test.cjs`, `tests/sidecar/test_screenshot_tool.py` |

## Boundary Rules

Keep these rules explicit in the change, tests, and docs:

- Linux is the only OS where desktop overlay surfaces should be hidden for screenshot capture.
- macOS and Windows should use Electron content protection only during SDK
  screenshot-capture leases, then disable it immediately after capture.
- Renderer code should consume normalized platform state; it should not shell out to OS commands or probe platform permissions directly.
- Local-runtime platform adapters should not import backend code.
- Backend tool schemas may describe a capability, but local-runtime code owns
  local execution.
- Packaging changes must be verified in an installed app, not only in Vite or Electron dev mode.
- Permission probes should report authority state; they should not silently perform a tool action to fake success unless that action is the documented OS prompt trigger.

## Change Sequence

1. Reproduce the behavior on the affected OS, or identify the OS-specific assumption if you cannot reproduce locally.
2. Choose the owner row from the fast owner map.
3. Read the OS page and matrix that matches the behavior.
4. Inspect the owner source file and its nearest focused tests.
5. Make the platform-specific policy explicit in code instead of relying on incidental `process.platform` checks scattered across consumers.
6. Update the matrix doc and the OS page if behavior changes.
7. Validate the owner tests and at least one adjacent boundary test.
8. For packaging changes, run source build validation and target OS installed-app smoke validation.

## Electron Main Platform Changes

Electron main owns desktop app windows, overlays, content protection, IPC
handlers, permission probes, and SDK local-runtime host/status context. Use this
path when the bug concerns an app-owned surface.

Primary files:

- `frontend/src/main/surfaces/window_platform_policy.cjs`
- `frontend/src/main/platform/content_protection/index.cjs`
- `frontend/src/main/platform/content_protection/supported.cjs`
- `frontend/src/main/surfaces/display_affinity_runtime.cjs`
- `frontend/src/main/permissions/permission_service*.cjs`

Use this owner for:

- `BrowserWindow` flags.
- overlay topmost/all-workspaces policy.
- `setContentProtection` behavior.
- screenshot hide/restore dispatch.
- display-affinity selection for capture.
- permission probe and grant IPC.
- local-runtime launch parameters.

Do not use this owner for:

- React-only layout bugs.
- backend websocket payloads.
- local mouse or keyboard execution.
- OCR or vision model behavior.

## Renderer Platform Changes

Renderer platform work should be limited to presentation and state orchestration for surfaces that Electron main already owns. The renderer can latch overlay state, render permission rows, and dispatch IPC requests. It should not decide OS authority or execute platform commands.

Primary files:

- `frontend/src/renderer/features/chat/**`
- `frontend/src/renderer/features/overlays/**`
- `frontend/src/renderer/features/onboarding/**`
- `frontend/src/renderer/features/permissions/**`
- `frontend/src/renderer/features/settings/**`

Use this owner for:

- chat pill and response overlay phase rendering.
- permission row labels and action buttons.
- settings display of platform state.
- renderer-side latches that prevent transient phase flicker.
- tool-result and screenshot attachment UI state.

Do not use this owner for:

- OS permission probing.
- calling `xdotool`, PowerShell, AppleScript, or AppKit.
- choosing content-protection behavior.
- hiding native windows from renderer code instead of the Electron main screenshot-capture lease.

## Local-Runtime Python Platform Changes

The local runtime owns host OS automation and local tool execution through the current local-runtime Python implementation. It should expose normalized tool results back to Electron, not leak OS-specific command details into the renderer.

Primary files:

- `frontend/src/main/python/core/platform/__init__.py`
- `frontend/src/main/python/core/platform/base.py`
- `frontend/src/main/python/core/platform/macos.py`
- `frontend/src/main/python/core/platform/windows.py`
- `frontend/src/main/python/core/platform/linux.py`
- `frontend/src/main/python/core/platform/macos_automation_permission.py`
- `frontend/src/main/python/tools/computer/mouse_tool.py`
- `frontend/src/main/python/tools/computer/keyboard_tool.py`
- `frontend/src/main/python/tools/computer/scroll_tool.py`
- `frontend/src/main/python/tools/computer/screenshot_tool.py`

Use this owner for:

- active-window detection.
- window listing and switching.
- screenshot capture mechanics.
- mouse, keyboard, and scroll execution.
- OS command fallbacks for local automation.
- local system-state probes.

Do not use this owner for:

- model-visible tool schema changes.
- Electron permission UI state.
- backend prompt policy.
- hosted API auth.

## Permission Changes

Permission changes cross Electron main and renderer, and sometimes sidecar verification code. Keep the authority boundary simple:

- Electron main probes the OS and returns normalized permission status.
- Renderer displays status and invokes grant actions.
- Local runtime executes local tools only after the Electron/renderer path has surfaced the required authority.
- Backend may hide or show tool capability based on client-provided policy, but it cannot grant OS authority.

Common files:

- `frontend/src/main/permissions/permission_service_runtime.cjs`
- `frontend/src/main/permissions/permission_service_input_control.cjs`
- `frontend/src/main/permissions/permission_service_screen_capture.cjs`
- `frontend/src/main/permissions/permission_service_microphone.cjs`
- `frontend/src/main/permissions/permission_service_browser.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/renderer/features/onboarding/**`
- `frontend/src/renderer/features/permissions/**`

Validation:

- `tests/frontend/PermissionService.test.cjs`
- `tests/frontend/PermissionIpcRuntime.test.cjs`
- `tests/frontend/permissionStore.test.js`
- `tests/frontend/useOnboardingPermissionActions.test.jsx`
- target OS manual permission probe when changing a real grant path.

## Packaging Changes

Packaging changes must prove that the installed app can run the same local authority path as development. A source-only validation is not enough when a change touches bundled runtime, helper scripts, signing, dependency inclusion, or installed-app paths.

Common files:

- `frontend/package.json`
- `frontend/electron-builder.*`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/sidecar/local_runtime_launch_options.cjs`
- `frontend/src/main/python/requirements.runtime.txt`
- `scripts/build-sidecar-runtime`
- `<windie> reinstall mac`
- `<windie> reinstall linux`
- `<windie> reinstall win`
- `scripts/ci/smoke-macos-packages.sh`
- `scripts/ci/smoke-linux-packages.sh`
- `scripts/ci/smoke-windows-packages.ps1`

Validation sequence:

1. `<windie> build local-runtime`
2. target OS package command from [Packaging Runtime Matrix](packaging_runtime_matrix.md)
3. inspect installed package for `resources/python-runtime`
4. launch installed app
5. send one prompt
6. run one local-runtime-backed local tool
7. verify backend endpoint selection
8. run the target OS smoke helper when available

## Test Selection

| Changed behavior | Minimum tests |
| --- | --- |
| content protection | `tests/frontend/WindowPlatformPolicy.test.cjs`, `tests/frontend/DisplayAffinityRuntime.test.cjs` |
| screenshot hide/restore | `tests/frontend/LocalRuntimeWindowVisibility.test.cjs` |
| overlay phase latching | `tests/frontend/ResponseOverlayPhaseHandler.test.cjs` |
| permission probe or grant | `tests/frontend/PermissionService.test.cjs`, `tests/frontend/PermissionIpcRuntime.test.cjs` |
| local-runtime screenshot implementation | `tests/sidecar/test_screenshot_tool.py` |
| sidecar input tools | `tests/sidecar/test_mouse_tool.py`, `tests/sidecar/test_keyboard_tool.py`, `tests/sidecar/test_scroll_tool.py` |
| window manager | `tests/sidecar/test_macos_window_manager.py`, `tests/sidecar/test_windows_window_manager.py`, `tests/sidecar/test_linux_window_manager.py`, `tests/sidecar/test_platform_module_selection.py` |
| packaged runtime | target OS package command and smoke helper |

## Review Checklist

- The fix changes the owner runtime instead of a downstream consumer workaround.
- Each platform policy branch is explicit and named.
- Linux screenshot hide/restore did not leak into macOS or Windows.
- macOS and Windows content protection is disabled for idle and terminal phases.
- Renderer code does not call platform commands directly.
- Sidecar platform code does not import backend modules.
- Permission docs describe both probe and grant behavior.
- Packaging docs mention installed-app validation when packaged runtime behavior changed.
- Tests cover the OS policy branch that changed and the adjacent boundary.

## Related Docs

- [Platforms Hub](README.md)
- [Platform Permission Matrix](permission_matrix.md)
- [Screenshot and Overlay Policy](screenshot_overlay_policy.md)
- [Window and Input Matrix](window_input_matrix.md)
- [Packaging Runtime Matrix](packaging_runtime_matrix.md)
- [Computer Tools](../tools/computer.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Install Decision Matrix](../install/install_decision_matrix.md)
- [Validation Commands](../cli/validation_commands.md)
