---
summary: "Electron main and renderer settings reference for the configurable global stop shortcut: platform accelerators, active-loop phase gating, fallback persistence, and backend-sync boundaries."
read_when:
  - When changing or debugging the Global Stop Shortcut selector in Settings > General.
  - When changing `global_agent_stop_shortcut`, globalShortcut registration, stop-query routing, active-loop phase gating, or shortcut fallback persistence.
  - When a global stop shortcut does not register, uses a fallback binding, stops the wrong turn, or appears in backend settings payloads.
title: "Global Stop Shortcut Runtime Reference"
---

# Global Stop Shortcut Runtime Reference

## Current Path

The global stop shortcut is split across renderer settings, Electron main, and
the SDK-shaped query runtime:

1. `GeneralSettingsTab.jsx` renders the **Global Stop Shortcut** selector and
   emits `onConfigChange({ global_agent_stop_shortcut })`.
2. Renderer config storage normalizes the selected accelerator through
   `DesktopShortcutRuntimeClient`, which delegates to the shortcut helper, and
   persists it locally.
3. `appConfigRuntimeSync.js` and the main settings sync path strip
   `global_agent_stop_shortcut` before sending backend `update-settings`
   payloads. This is local desktop state, not backend model/session config.
4. `ipc_desktop_ui_config_handlers.cjs` and `ipc_startup_state.cjs` pass the
   selected accelerator into `agent_stop_shortcut_runtime.cjs`. Fallback
   config persistence after native registration status updates is owned by
   `ipc_global_stop_shortcut_config_runtime.cjs`.
5. Electron main registers the accelerator only while an agent loop is active.
   When pressed, the runtime calls the current stop handler, which routes
   through `ipc_stop_target_runtime.cjs` into the active conversation/turn
   stop-query path. The handler targets the latest SDK current turn first, a
   renderer pending turn second, and the active conversation only as an idle
   fallback.

Focused chat and dashboard windows still support plain `Esc`; the renderer
keyboard handler accepts the canonical DOM `KeyboardEvent.key === "Escape"`
value and does not keep the older `"Esc"` key alias. The global shortcut exists
for stop-from-anywhere behavior while another app has focus.

## Main Runtime Rules

`frontend/src/main/shortcuts/agent_stop_shortcut_runtime.cjs` owns native registration:

- active phases that enable registration:
  - `awaiting-first-chunk`
  - `streaming`
  - `tool-call`
  - `tool-output`
- inactive phases unregister the accelerator
- repeated enable calls do not duplicate registration
- changing the accelerator mid-run unregisters the old binding and registers the
  new one
- when a requested accelerator cannot register, the runtime tries the next
  supported platform accelerator
- if an updated accelerator cannot register and the previous accelerator worked,
  the runtime falls back to the previous working accelerator

Renderer components must not call `globalShortcut` directly. Main owns native
registration and exposes state back to renderer through IPC status payloads.

`frontend/src/main/ipc/ipc_global_stop_shortcut_config_runtime.cjs` owns the
main-process status/config adapter around native registration:

- normalizes native shortcut status into renderer-visible scalar fields
- applies resolved fallback accelerators back into desktop UI config when the
  native runtime found a working fallback
- skips fallback persistence when registration failed or the fallback is
  already saved
- broadcasts updated IPC status snapshots after shortcut status changes
- keeps raw status normalization and config-fallback application private behind
  the composed shortcut config runtime facade

`frontend/src/main/ipc/ipc_stop_target_runtime.cjs` owns the target-resolution
rule for an already-registered stop action:

- `createMainStopTargetRuntime` composes the Electron main live-turn,
  pending-turn, active-conversation, SDK stop, and overlay-phase dependencies so
  `ipc.cjs` delegates the stop action instead of rebuilding the dependency bag.
- SDK current-turn projections are stoppable during `awaiting`, `streaming`,
  `tool_call`, `tool_output`, or when the SDK projection reports busy
  presentation state.
- Stoppable SDK current turns beat renderer pending-turn fallback.
- Renderer pending turns beat idle active-conversation fallback.
- A successful stop sends the SDK-shaped `{ conversation_ref, turn_ref }`
  command and completes the response overlay phase.
- The lower-level target resolver and executable stop trigger remain private to
  the helper module; callers use `createMainStopTargetRuntime(...).resolve()`
  and `createMainStopTargetRuntime(...).trigger()` as the Electron main
  composition boundary.

## Platform Catalog

Supported accelerators come from
`frontend/src/shared/agent_stop_shortcut_catalog.json`.

| Platform key | Default | Fallbacks |
| --- | --- | --- |
| `win32` | `CommandOrControl+Alt+.` (`Ctrl + Alt + .`) | `CommandOrControl+Shift+.`, `CommandOrControl+Alt+/` |
| `linux` | `CommandOrControl+Shift+Escape` (`Ctrl + Shift + Esc`) | `CommandOrControl+Alt+.`, `CommandOrControl+Shift+.` |
| `darwin` | `CommandOrControl+Shift+Escape` (`Command + Shift + Esc`) | `CommandOrControl+Alt+.`, `CommandOrControl+Shift+.` |

The renderer uses `DesktopShortcutRuntimeClient` for platform labels, supported
options, focused-window `Esc` detection, and config normalization. The lower-
level `agentStopShortcut.js` helper owns DOM/platform/catalog interpretation and
is imported by the runtime client and owner-level tests. Electron main uses
`process.platform` to normalize and register accelerators.

## Status Projection

`ipc.cjs` includes the `ipc_global_stop_shortcut_config_runtime.cjs` status
snapshot as `globalAgentStopShortcutStatus` in IPC status payloads. Renderer
providers consume this status to update Settings UI and persist fallback
bindings.

Projected fields:

- `enabled`
- `requestedAccelerator`
- `resolvedAccelerator`
- `registered`
- `registeredAccelerator`
- `registrationFailed`
- `usingFallback`
- `supportedAccelerators`

Settings shows:

- a fallback notice when `usingFallback === true` and the resolved accelerator
  differs from the requested accelerator
- a registration-failure warning when `registrationFailed === true`

If the runtime chooses a fallback accelerator, `AppConfigProvider` persists the
resolved binding locally so reloads and future startup use the working shortcut.

## Validation

Focused tests:

- `tests/frontend/AgentStopShortcutRuntime.test.cjs`
- `tests/frontend/AgentStopShortcut.test.js`
- `tests/frontend/SettingsSection.test.jsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcGlobalStopShortcutConfigRuntime.test.cjs`
- `tests/frontend/IpcStopTargetRuntime.test.cjs`
- `tests/frontend/IpcStartupState.test.cjs`
- `tests/frontend/IpcDesktopUiConfigHandlers.test.cjs`

Useful focused command:

```bash
<windie> test frontend -- AgentStopShortcutRuntime.test.cjs AgentStopShortcut.test.js SettingsSection.test.jsx AppConfigProvider.storageAndIpc.test.tsx IpcMainBridge.lifecycle.test.cjs IpcGlobalStopShortcutConfigRuntime.test.cjs IpcStartupState.test.cjs IpcDesktopUiConfigHandlers.test.cjs
```

## Related Docs

- [Settings Surface Change Workflow](../renderer/settings/settings_surface_change_workflow.md)
- [Config Sync and Settings Lifecycle Reference](../runtime/config_sync_and_settings_lifecycle_reference.md)
- [Frontend Runtime Surface](../runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md)
- [Main Process Change Workflow](main_process_change_workflow.md)
