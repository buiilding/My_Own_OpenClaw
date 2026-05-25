---
summary: "Deep reference for Linux-only agent sudo toggle runtime: unsupported persistent enable flow, pkexec legacy disable flow, and normalized auth-error/cancel semantics."
read_when:
  - When changing `set-agent-sudo-access` IPC behavior or Linux privilege-toggle command execution in Electron main process.
  - When debugging sudo toggle failures (`pkexec` missing, canceled auth dialog, legacy disable errors).
title: "Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference"
---

# Agent Sudo Access Handler PKExec and Legacy Disable Contract Reference

## Canonical Modules

- `frontend/src/main/agent_sudo_access_handler.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/main/index.cjs`
- `tests/frontend/AgentSudoAccessHandler.test.cjs`

## IPC Entry Path

`initializePermissionHandlersRuntime(...)` registers:

- `ipcMain.handle('set-agent-sudo-access', ...)`

Handler dependencies passed into `handleSetAgentSudoAccess(...)`:

- `platform` (`process.platform`)

The handler returns normalized payload objects to renderer, not thrown errors, for expected failure modes.

## Platform Guard

`handleSetAgentSudoAccess(options, deps)` hard-gates to Linux:

- non-Linux returns:
  - `success: false`
  - `canceled: false`
  - reason: Linux-only support message

## Sudoers Rule Contract

Rule path:

- `/etc/sudoers.d/99-windieos-agent-nopasswd`

Persistent passwordless sudo enable is not supported. The handler must not write
a sudoers rule granting `NOPASSWD: ALL`, because that grant applies to the
whole local user account outside WindieOS.

Disable script (`buildDisableScript()`) executes:

1. `rm -f /etc/sudoers.d/99-windieos-agent-nopasswd`

## Command Execution Modes

Enable path:

- returns `success: false`
- does not spawn a privileged command
- directs sudo commands to the existing per-command OS prompt flow

Disable path:

- command: `pkexec bash -lc <disable-script>`
- rationale: remove the legacy sudoers rule with an explicit OS authentication prompt

Shared runner (`runCommandWithCapturedOutput`) behavior:

- captures `stdout` and `stderr`
- resolves structured result on both `error` and `close` events
- maps `ENOENT` on `pkexec` to explicit missing-auth-prompt guidance
- preserves spawn startup errors as failure reason strings

## Error Normalization Contract

Auth cancel markers (case-insensitive `stderr` scan):

- `not authorized`
- `request dismissed`
- `authentication dialog was dismissed`
- `authentication failed`
- `authorization failed`
- `user canceled` / `user cancelled`

General mapping:

- matched cancel marker -> `canceled: true` with user-canceled reason
- unmatched stderr -> `canceled: false` with command-failure reason

## Response Shape Semantics

Success responses include:

- `success: true`
- `enabled: <target-state>`
- `canceled: false`
- stable human-readable reason

Failure responses include:

- `success: false`
- `enabled: !<target-state>` (reflects unchanged persisted state)
- `canceled` derived from auth-cancel normalization (except disable special-case path)
- normalized reason text

## Test-Backed Invariants

`tests/frontend/AgentSudoAccessHandler.test.cjs` locks:

- non-Linux rejection contract
- enable path rejects persistent passwordless sudo without spawning privileged commands
- dismissed auth prompt maps to `canceled: true`
- missing `pkexec` (`ENOENT`) returns explicit unavailable-auth-prompt reason
- disable path executes `pkexec` to remove the legacy sudoers file and succeeds on exit `0`
- disable spawn startup errors are surfaced verbatim

## Drift Hotspots

1. Reintroducing a broad sudoers rule such as `NOPASSWD: ALL` grants machine-wide passwordless sudo outside WindieOS.
2. Changing cancel-marker strings without test updates can regress user-cancel detection on some desktop environments.

## Related Docs

- [Permission Manifest, Probe, and IPC Request Contract Reference](permission_manifest_probe_and_request_ipc_reference.md)
- [Electron Main and IPC](electron_main_and_ipc.md)
- [Settings Section Clone Tabs and Wakeword Toggle Runtime Reference](../renderer/settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md)
