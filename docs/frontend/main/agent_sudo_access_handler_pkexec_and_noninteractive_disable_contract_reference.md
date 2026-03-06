---
summary: "Deep reference for Linux-only agent sudo toggle runtime: username sanitization, pkexec enable flow, non-interactive sudo disable flow, and normalized auth-error/cancel semantics."
read_when:
  - When changing `set-agent-sudo-access` IPC behavior or Linux privilege-toggle command execution in Electron main process.
  - When debugging sudo toggle failures (`pkexec` missing, canceled auth dialog, non-interactive disable errors).
title: "Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference"
---

# Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference

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
- `username` (`os.userInfo()?.username` best effort)

The handler returns normalized payload objects to renderer, not thrown errors, for expected failure modes.

## Platform and User Guards

`handleSetAgentSudoAccess(options, deps)` hard-gates to Linux:

- non-Linux returns:
  - `success: false`
  - `canceled: false`
  - reason: Linux-only support message

Username resolution guard:

- `sanitizeUsername(...)` requires non-empty string matching:
  - `^[a-z_][a-z0-9_.-]*$` (case-insensitive)
- invalid/empty username returns fail response before any privileged command execution

## Sudoers Rule Contract

Rule path:

- `/etc/sudoers.d/99-windieos-agent-nopasswd`

Enable script (`buildEnableScript(username)`) executes:

1. `cat > /etc/sudoers.d/99-windieos-agent-nopasswd <<EOF`
2. writes `${username} ALL=(ALL) NOPASSWD: ALL`
3. `chmod 440` on the sudoers file
4. `visudo -cf` validation of written rule

Disable script (`buildDisableScript()`) executes:

1. `rm -f /etc/sudoers.d/99-windieos-agent-nopasswd`

## Command Execution Modes

Enable path:

- command: `pkexec bash -lc <enable-script>`
- rationale: interactive OS authentication prompt for privileged write

Disable path:

- command: `sudo -n bash -lc <disable-script>`
- rationale: non-interactive remove without opening auth prompt

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

Disable-path special handling:

- when stderr indicates password-required/permission-denied (or auth-cancel markers), response is normalized to:
  - `success: false`
  - `canceled: false`
  - reason instructing non-interactive disable limitation (`without prompt`)

This keeps disable UX deterministic even when underlying sudo output varies.

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
- enable path executes `pkexec ... NOPASSWD: ALL` script and succeeds on exit `0`
- dismissed auth prompt maps to `canceled: true`
- missing `pkexec` (`ENOENT`) returns explicit unavailable-auth-prompt reason
- disable path executes `sudo -n` and succeeds on exit `0`
- disable password-required case returns non-canceled `without prompt` guidance
- disable spawn startup errors are surfaced verbatim

## Drift Hotspots

1. Changing sudoers rule path without updating enable+disable scripts creates one-way toggle behavior.
2. Relaxing username sanitizer risks shell-script injection in privileged command content.
3. Removing `visudo -cf` validation can allow malformed sudoers content to be written.
4. Changing cancel-marker strings without test updates can regress user-cancel detection on some desktop environments.

## Related Docs

- [Permission Manifest, Probe, and IPC Request Contract Reference](permission_manifest_probe_and_request_ipc_reference.md)
- [Electron Main and IPC](electron_main_and_ipc.md)
- [Settings Section Clone Tabs and Wakeword Toggle Runtime Reference](../renderer/settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md)
