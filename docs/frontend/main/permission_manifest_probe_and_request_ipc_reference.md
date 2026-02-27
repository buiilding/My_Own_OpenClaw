---
summary: "Deep reference for Electron main permission runtime: manifest snapshot surface, OS-specific probe/request behavior, and renderer IPC handlers for onboarding/data-controls flows."
read_when:
  - When changing `permission_service.cjs` probe/request logic or permission manifest shape.
  - When adding/removing permission IPC handlers consumed by renderer onboarding or settings data-controls flows.
title: "Permission Manifest, Probe, and IPC Request Contract Reference"
---

# Permission Manifest, Probe, and IPC Request Contract Reference

## Canonical Modules

- `frontend/src/main/permission_service.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/shared/permissions/permission_manifest.json`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `tests/frontend/PermissionService.test.cjs`

## Manifest Contract

Manifest source of truth:

- `frontend/src/shared/permissions/permission_manifest.json`

Top-level fields surfaced to renderer:

- `manifest_version`
- `generated_at`
- `permissions[]`

Permission definition fields cloned by service:

- `permission_id`, `label`, `description`, `risk_level`
- `required_now`, `required_for_planned_system_access`
- `os_scope`, `validation_probe`, `unlocks_tool_groups`

## Probe Runtime (`permission_service.cjs`)

`runPermissionProbe(permissionId, deps)` dispatches by permission id:

- `screen_capture`:
  - macOS: uses `systemPreferences.getMediaAccessStatus('screen')`
  - non-macOS: currently granted by platform profile contract
- `input_control_accessibility`:
  - macOS: uses `systemPreferences.isTrustedAccessibilityClient(false)`
  - non-macOS: currently granted by platform profile contract
- `microphone`:
  - uses `getMediaAccessStatus('microphone')`
- `filesystem_workspace_access`, `shell_execution`, `browser_automation`:
  - runtime-capability probe scaffold (`probe_stub: true`)
- `planned_system_access`:
  - consent-only pseudo permission (always granted probe response)

Status payload shape:

- `permission_id`
- `status` (`granted|needs-action|unsupported|error`)
- `granted` (derived boolean)
- `reason`
- `checked_at`
- `details` object

Unknown permission ids return `status: error`.

## Permission Request Runtime

`requestPermission(permissionId, deps)` behavior:

- `microphone`:
  - if available, calls `systemPreferences.askForMediaAccess('microphone')`
  - then re-runs probe
- macOS deep links via `shell.openExternal(...)`:
  - screen capture -> privacy screen-capture pane
  - accessibility input control -> privacy accessibility pane
- all paths end with `runPermissionProbe(...)` result return

Request API is best-effort and returns normalized probe/status payloads.

## Main IPC Handler Surface (`index.cjs`)

Renderer invoke handlers:

- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

Handler dependency bundle:

- `platform: process.platform`
- `shell` (Electron shell module)
- `systemPreferences` (Electron system permission APIs)

Response wrapper contract:

- always `{ success: true, data: ... }` for handler-level success
- per-permission probe/request failures represented inside status payload (`status: error`), not as handler throw

## Preload/Channel Boundary

Permission invoke channels must remain aligned across:

- preload allowlist (`preload.js`)
- renderer constants (`INVOKE_CHANNELS`)
- index handler registration (`ipcMain.handle`)

Channel names:

- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

## Drift Hotspots

1. Manifest field changes without updating clone/shape contracts in service.
2. Adding permission ids in manifest without probe/request switch handling.
3. Channel parity drift between preload/channels constants/index handler registration.
4. Treating `probe_stub` runtime capability responses as production security guarantees.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [Renderer Permissions Docs Hub](../renderer/permissions/README.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](../renderer/permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [IPC Channel and Handler Reference](../contracts/ipc_channel_and_handler_reference.md)
