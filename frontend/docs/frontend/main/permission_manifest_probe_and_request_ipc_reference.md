---
summary: "Deep reference for Electron main permission runtime: manifest snapshot surface, OS-specific probe/request behavior, and renderer IPC handlers for onboarding and focused settings flows."
read_when:
  - When changing `permission_service.cjs` probe/request logic or permission manifest shape.
  - When adding/removing permission IPC handlers consumed by renderer onboarding or focused settings flows.
title: "Permission Manifest, Probe, and IPC Request Contract Reference"
---

# Permission Manifest, Probe, and IPC Request Contract Reference

## Canonical Modules

- `frontend/src/main/permissions/permission_service.cjs`
- `frontend/src/main/permissions/permission_service_runtime.cjs`
- `frontend/src/main/permissions/permission_service_screen_capture.cjs`
- `frontend/src/main/permissions/permission_service_input_control.cjs`
- `frontend/src/main/permissions/permission_service_microphone.cjs`
- `frontend/src/main/permissions/permission_service_automation.cjs`
- `frontend/src/main/permissions/permission_service_workspace.cjs`
- `frontend/src/main/permissions/permission_service_browser.cjs`
- `frontend/src/main/permissions/permission_state_store.cjs`
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
- `access_kind`, `grant_action_label`
- `required_now`, `required_for_planned_system_access`
- `onboarding_required_now`, `show_in_onboarding`, `onboarding_visibility`
- `os_scope`, `validation_probe`, `unlocks_tool_groups`

## Probe Runtime (`permission_service.cjs`)

`runPermissionProbe(permissionId, deps)` is async and dispatches by permission id.
`permission_service.cjs` now acts as the orchestrator only; per-domain probe/request
logic lives in the focused permission-service modules listed above.

Current probe ownership:

- `screen_capture`:
  - macOS: uses `systemPreferences.getMediaAccessStatus('screen')`
  - Windows/Linux: probes desktop-capture capability directly through Electron `desktopCapturer.getSources(...)`
- `input_control_accessibility`:
  - macOS: uses `systemPreferences.isTrustedAccessibilityClient(false)`
  - Windows/Linux: runs an explicit capability verifier on startup/re-check instead of relying on prior in-memory request state
- `microphone`:
  - macOS: uses `getMediaAccessStatus('microphone')`
  - Windows/Linux: probes microphone capability directly
- `filesystem_workspace_access`:
  - reads persisted folder-selection state from `permission_state_store.cjs` and verifies the selected path still exists
- `shell_execution`:
  - requires a persisted explicit shell-execution authorization grant plus a
    current runtime availability check (shell/PowerShell presence)
  - shell runtime availability alone reports `needs-action`
- `browser_automation`:
  - requires both renderer config enablement and local-runtime browser capability verification; missing verifier now fails closed
  - pre-grant guidance now tells users that the host-skinned app will open its dedicated browser so they can sign in with the profile the agent host should use

Status payload shape:

- `permission_id`
- `status` (`granted|needs-action|unsupported|error`)
- `granted` (derived boolean)
- `reason`
- `checked_at`
- `details` object

Unknown permission ids return `status: error`.

Platform-aware onboarding metadata is computed in main before the manifest reaches
the renderer:

- macOS keeps first-run onboarding for real OS/privacy grants plus selected
  setup actions such as workspace access and browser profile warm-up
- Windows/Linux downgrade screen-capture and input-control rows to
  settings/control-center only because those paths are runtime capability checks,
  not true first-run OS permission prompts
- shell verification is not shown in onboarding because it is a runtime
  availability check rather than a grant

## Permission Request Runtime

`requestPermission(permissionId, deps)` behavior:

- `microphone`:
  - if available, calls `systemPreferences.askForMediaAccess('microphone')`
  - on macOS, if native prompt is unavailable/denied in-process, falls back to renderer `navigator.mediaDevices.getUserMedia({ audio: true })` to trigger TCC registration
  - then re-runs probe
- `screen_capture`:
  - macOS: if Screen Recording is still missing, first attempts one real desktop-capture request so macOS can register the host app in the Screen Recording list, but does not auto-open System Settings on that first request
  - if the native macOS prompt does not complete the grant, the user can then open the Screen Recording settings pane manually and keep onboarding open while the app re-probes
  - onboarding switches the row into `Waiting...` and keeps re-probing while the user enables the app in System Settings
  - once macOS reports the permission as granted, the app focuses the onboarding window and runs one real screenshot verification through the same capture path used by auto-screenshot so the direct capture path is verified during onboarding instead of surprising the first send
  - Windows: verifies desktop capture directly via `desktopCapturer.getSources(...)`; does not deep-link to Windows privacy settings
  - Linux: verifies desktop capture directly via Electron capability check
- `filesystem_workspace_access`:
  - opens a folder picker and persists the selected paths to `permission_state_store.cjs`
  - the same picker is reused by the native `File -> Set active workspace…` app-menu action so users can switch the default workspace folder outside onboarding/settings
- `shell_execution`:
  - runs an elevated authentication flow, persists a successful explicit
    shell-execution grant in the app-managed permission state store, then
    re-runs the probe so runtime availability is still checked
- `browser_automation`:
  - verifies runtime availability, optionally installs Chromium on consent, then runs a real dedicated `browser connect` warm-up so onboarding/settings can open the controlled browser ahead of first task use
  - successful request leaves the dedicated browser session available for sign-in/profile setup; status is inferred from real connect success, not a separate OS permission probe
- macOS deep links via `shell.openExternal(...)`:
  - screen capture -> privacy screen-capture pane
  - accessibility input control -> privacy accessibility pane
- all paths end with `runPermissionProbe(...)` result return

Request API is best-effort and returns normalized probe/status payloads.

## Persistent App-Managed State

`permission_state_store.cjs` persists app-managed grants that are not OS privacy permissions.
Writes are serialized per resolved state path and use unique temporary files so
concurrent independent permission updates do not lose each other during
read-modify-write persistence.
The public `createPermissionStateStore(...)` facade owns state-path resolution
through `store.resolveStatePath()`; callers should not import lower-level path
helpers from the module.

Current persisted item:

- `filesystem_workspace_access` selected folder paths
  - local-runtime shell commands use the first still-existing selected path as the default cwd when `directory` is omitted
- `shell_execution` explicit authorization grant
  - probes still require the shell/PowerShell runtime verifier to pass, so the
    stored grant is not treated as runtime availability

Current non-persisted items:

- OS permissions (`screen_capture`, `input_control_accessibility`, `microphone`) because they are re-probed from the platform or capability verifier
- `browser_automation` because enablement is desktop UI config owned and runtime readiness is re-verified

## Main IPC Handler Surface (`index.cjs`)

Renderer invoke handlers:

- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

Handler dependency bundle:

- `platform: process.platform`
- `userDataPath` used to initialize `permission_state_store.cjs`
- `shell` (Electron shell module)
- `systemPreferences` (Electron system permission APIs)
- foreground/focus bridge (`focusPermissionPromptWindow`) used before macOS microphone prompt flows
- renderer microphone prompt bridge (`requestRendererMicrophoneAccess`) used by macOS microphone request fallback

Response wrapper contract:

- always `{ success: true, data: ... }` for handler-level success
- per-permission probe/request failures represented inside status payload (`status: error`), not as handler throw

Permission probe/request trace context is an Electron-main helper input, not a
backend wire payload. Conversation-scoped permission traces read only
`conversationRef` and `turnRef` from the top-level options object or nested
`_trace` object. Removed snake_case helper aliases such as `conversation_ref`
and `turn_ref` are ignored, so callers using those fields fall back to app
diagnostics instead of conversation trace rows.
`ipc_main_process_trace_runtime.cjs` owns the final routing decision: idle
permission probes write app diagnostics, while probes with both conversation
and turn context write hidden SDK `trace_event` conversation rows.

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
4. Reintroducing session-only grant memory in place of startup re-probes or persisted app-managed state.
5. Assuming Windows has a macOS-style screen-capture privacy pane; current Windows behavior is capability verification, not OS settings registration.
6. Treating browser automation as granted when no runtime verifier is configured; current behavior is fail-closed.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [Renderer Permissions Docs Hub](../renderer/permissions/README.md)
- [Permission Onboarding Gate, Manifest Version, and Data-Controls Runtime Reference](../renderer/permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [IPC Channel and Handler Reference](../contracts/ipc_channel_and_handler_reference.md)
