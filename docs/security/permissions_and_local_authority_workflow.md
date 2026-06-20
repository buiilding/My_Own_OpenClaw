---
summary: "Workflow for changing WindieOS desktop permissions and local-machine authority across onboarding, Electron main permission services, platform adapters, local-runtime tools, and tests."
read_when:
  - When changing screen capture, input control, microphone, browser, workspace, sudo, or local tool authority.
  - When debugging a permission that is shown as granted/denied incorrectly.
  - When deciding whether a local authority issue belongs to renderer onboarding, Electron main permission services, platform adapters, or local-runtime tools.
title: "Permissions and Local Authority Workflow"
---

# Permissions and Local Authority Workflow

Permissions are not just UI state. They control whether WindieOS can see the screen, control input, hear the microphone, use browser automation, access workspace context, and run local tools. Keep the authority check close to the privileged action.

## Permission Surfaces

| Surface | Code roots | Owns |
| --- | --- | --- |
| Permission manifest | `frontend/src/shared/permissions/permission_manifest.json` | Which permissions exist, onboarding visibility, generic permission descriptions, and capability grouping. |
| Main permission IPC | `frontend/src/main/permissions/permission_ipc_runtime.cjs` | Renderer invoke/send channel registration for list/check/request/probe operations. |
| Permission services | `frontend/src/main/permissions/permission_service*.cjs` | OS-specific probes and request/open-settings behavior for screen, input, mic, browser, workspace, and automation. |
| Permission state store | `frontend/src/main/permissions/permission_state_store.cjs` | Main-process cached permission state and notifications. |
| Renderer onboarding/settings | `frontend/src/renderer/features/onboarding`, `frontend/src/renderer/features/permissions`, `frontend/src/renderer/app/runtime/desktopPermissionRuntimeClient.ts`, `frontend/src/renderer/app/runtime/desktopPermissionGrantEffectsRuntime.js`, `frontend/src/renderer/app/skin` | User-visible permission gates, status rows, request buttons, control center, runtime-client permission commands, post-grant renderer effects, external-grant follow-up probe policy, and product-specific onboarding shell copy. |
| Local-runtime platform/tools | `frontend/src/main/python/core/platform`, `frontend/src/main/python/tools` | Runtime local execution that may fail when OS permission is missing. |

## Add or Change a Permission

1. Add or update the permission contract in `permission_manifest.json` with product-neutral copy.
2. Add Electron main probe/request/check logic in the focused permission service module.
3. Register IPC behavior through `permission_ipc_runtime.cjs` only if the renderer needs a new operation.
4. Update renderer onboarding/control-center display, permission runtime client, or skin copy only after the main service can report truthfully.
5. Update local-runtime tool behavior to fail clearly when the capability is unavailable.
6. Add tests for manifest display, main permission service, renderer state, and local-runtime platform behavior where applicable.
7. Update platform docs if the behavior differs on macOS, Windows, or Linux.

Do not mark a permission granted just because the user clicked a button. The source of truth is the OS probe or the privileged operation result.

## Authority Matrix

| Capability | UI owner | Enforcement owner | Notes |
| --- | --- | --- | --- |
| Screen capture | Onboarding and permissions store | Main permission service and screenshot/capture path | Linux overlay hide/restore is platform policy, not permission state. |
| Input control | Permissions UI | Main and local-runtime platform adapters for mouse/keyboard/window actions | macOS automation/accessibility and Windows/Linux input paths differ. |
| Microphone | Voice/onboarding UI | Main microphone permission service and renderer capture flow | Voice UI should surface denied/not-ready separately from STT provider failure. |
| Browser automation | Browser/session UI and permission surface | Dedicated browser runtime and local-runtime Python browser tools | Browser availability is not the same as arbitrary user Chrome control. |
| Workspace/repo context | Chat/settings surfaces | Main workspace access/runtime helpers | Do not treat workspace access as broad filesystem permission. |
| Shell/filesystem tools | Tool policy and permissions UI | Backend tool visibility, main shell-execution authorization probe, plus local-runtime validation | Shell execution requires both an explicit persisted authorization grant and current runtime availability. Local execution must validate args even if model schema is narrow. |

Workspace access grants must come from the main-process workspace picker flow.
Renderer-driven active-workspace sync may switch to a previously selected path
or clear the active path, but it must not mark an arbitrary path as granted.

Permission state persistence serializes updates per state file. Keep new
permission writes inside that store boundary instead of adding separate
read-modify-write paths.

Shell execution is app-managed permission state: a successful elevated
authorization flow persists a `shell_execution` grant, but probes still require
the shell/PowerShell runtime verifier to pass. Runtime availability by itself
must not mark shell execution granted.

## Failure Routing

| Symptom | First check |
| --- | --- |
| Onboarding says permission is missing but OS shows granted | Main permission probe implementation and cached permission state. |
| UI says granted but tool fails | Local-runtime platform/tool runtime and privileged operation result. |
| Permission button does nothing | Renderer action, IPC channel, main permission handler, OS open-settings/request code. |
| Screen capture hides windows on macOS/Windows | Screenshot overlay policy; hide/restore should be Linux-specific unless requirements change. |
| Input tool works on one OS only | Platform adapter and OS docs, not backend schema. |
| Linux sudo command does not show an OS prompt | Local-runtime shell sudo rewrite and `pkexec` availability. |

## Test Targets

| Behavior | Tests |
| --- | --- |
| Permission manifest and store | `tests/frontend/PermissionStorage.test.js`, `tests/frontend/permissionStore.test.js` |
| Main permission IPC/service | `tests/frontend/PermissionIpcRuntime.test.cjs`, `tests/frontend/PermissionService.test.cjs` |
| Onboarding permission actions | `tests/frontend/AppPermissionGate.test.jsx`, `tests/frontend/useOnboardingPermissionActions.test.jsx` |
| Permission grant effects | `tests/frontend/permissionGrantEffects.test.js` |
| Linux sudo prompt behavior | `tests/sidecar/test_shell_process_tool.py` |
| Platform permission adapters | `tests/sidecar/test_macos_automation_permission.py`, platform-specific local-runtime Python tests |

## Related Docs

- [Security Boundary Matrix](security_boundary_matrix.md)
- [Security Change Playbook](security_change_playbook.md)
- [Onboarding and Permissions](../desktop/onboarding_permissions.md)
- [Platform Permission Matrix](../platforms/permission_matrix.md)
- [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md)
- [Window and Input Matrix](../platforms/window_input_matrix.md)
