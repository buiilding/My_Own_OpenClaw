---
summary: "Plan to replace the duplicate Electron-main desktop UI config cache with a single main-owned config store runtime, keeping disk as persistence and query-time Agent config reads on the live source of truth."
title: "Desktop UI Config Store Authority Plan"
---

# Desktop UI Config Store Authority Plan

Date: 2026-06-24

Status: proposed.

## Goal

Replace the current Electron-main `latestDesktopUiConfig` cache helper with one
main-owned desktop UI config store runtime.

The store is the live source of truth for query-time Agent config, settings
sync, MCP enablement, global stop shortcut fallback, workspace fallback, and
browser automation checks. Disk remains persistence only.

This follows the narrow bug fix that promoted renderer-local Agent settings
into main config on startup. That fix is correct, but it still preserves the
underlying problem: too many code paths have to remember how to keep a cache in
sync with renderer storage and disk.

## Product Invariant

When the user changes Agent settings, the next query must use those exact
settings for system prompt and tool policy.

The transparency panel must never show default prompt/tool schemas because
Electron main read a stale duplicate cache while the settings UI showed newer
values.

## Current Problem

Electron main currently has a small cache module:

- `frontend/src/main/ipc/ipc_desktop_ui_config_cache.cjs`

Several runtimes read or mutate that cache:

- Agent definition context
- first-query settings sync
- desktop UI config load/save IPC
- MCP registry config preservation
- global stop shortcut fallback persistence
- workspace-path fallback
- browser automation availability checks

Recent fixes added startup promotion and save-time cache advancement so the
cache sees renderer-managed Agent settings before the next query. Those fixes
protect the current behavior, but the shape is still fragile:

- renderer localStorage can contain fields main does not know about yet
- disk writes are asynchronous and should not gate query correctness
- `frontend-config.json` is redacted and is not the full credential source
- different runtimes still choose between latest cache, disk, or renderer sync
- tests have to protect synchronization mechanics instead of one owner contract

## Source Of Truth Rule

Do not replace the cache with repeated raw disk reads.

`frontend-config.json` is persistence, not live runtime authority:

- settings edits save asynchronously
- provider credentials live in the encrypted safeStorage side file
- disk reads would reintroduce races after just-edited settings
- query send should not depend on filesystem timing

The source of truth should be an Electron-main runtime store:

```text
DesktopUiConfigStore
  hydrateFromDisk()
  getSnapshot()
  replaceFromRenderer(config)
  patchMainOwnedFields(patch)
  persist()
  resetForTests()
```

The store owns the current redacted, sanitized config value in memory. Disk is
only the durability adapter behind hydrate and persist.

## Target Ownership

### Electron Main Owns The Store

Electron main owns the current desktop UI config snapshot because query-time
Agent definition assembly, MCP registry policy, global shortcuts, and SDK
runtime setup all run in main.

Renderer should not be a runtime source of truth after it sends a config update.

### Renderer Writes Through IPC

Renderer keeps localStorage as the fast startup UI seed, but once it calls
`save-frontend-config`, Electron main store receives the sanitized payload and
becomes the runtime authority.

Provider secrets remain special:

- renderer localStorage stores redacted provider key status
- Electron main receives raw provider keys only through local IPC
- Electron main writes raw keys only to encrypted safeStorage credential
  persistence
- the live desktop UI config store remains redacted

### Disk Persists The Store

Disk load hydrates the store at startup and on `load-frontend-config`.

Disk save persists the store's redacted config and the credential side file,
but disk is not consulted during query-time Agent definition assembly unless
the store has not been hydrated yet and the caller explicitly requests
hydration.

## Proposed Runtime Shape

Create `frontend/src/main/ipc/ipc_desktop_ui_config_store.cjs`.

Public facade:

```js
function createDesktopUiConfigStoreRuntime({
  loadDesktopUiConfigFromDisk,
  loadDesktopUiConfigFromDiskSync,
  saveDesktopUiConfigToDisk,
  redactDesktopUiConfigProviderSecrets,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  log,
}) {
  return {
    hydrate,
    hydrateSync,
    getSnapshot,
    getRawForInternalUse,
    replaceFromRenderer,
    replaceFromDisk,
    patchMainOwnedFields,
    persist,
    reset,
  };
}
```

Keep the public surface small. Runtimes should ask the store for a snapshot or
ask it to perform an owner-specific mutation. They should not reconstruct
cache-preservation rules at callsites.

## Migration Phases

### Phase 1: Introduce Store Beside Cache

- Add the store runtime with tests for hydrate, snapshot clone behavior,
  redaction, provider credential persistence boundaries, MCP enablement
  preservation, and shortcut fallback patching.
- Keep `ipc_desktop_ui_config_cache.cjs` in place temporarily.
- Wire `save-frontend-config` through the store first, then mirror to the old
  cache to keep existing consumers unchanged during this phase.
- Add diagnostics proving store and cache snapshots match after load/save.

Validation:

- `tests/frontend/IpcDesktopUiConfigStore.test.cjs`
- existing desktop UI config handler and persistence runtime tests

### Phase 2: Move Query-Time Readers To Store

Route these consumers to the store snapshot:

- `ipc_agent_definition_context.cjs`
- `ipc_settings_sync_runtime.cjs`
- `ipc_workspace_path_runtime.cjs`
- `ipc_global_stop_shortcut_config_runtime.cjs`
- browser automation checks in `frontend/src/main/index.cjs`
- MCP registry config reads

Agent definition attach should read one fresh store snapshot immediately after
initial settings sync/pending settings sync settles.

Validation:

- Agent custom prompt and disabled tool policy affect the first query after
  restart.
- Just-edited Agent settings affect the next query without app restart.
- Disabled tools stay absent from the transparency tool-schema panel.
- Web search disabled in Agent settings is not exposed as a remote tool.

### Phase 3: Delete Cache And Sync Patches

- Delete `ipc_desktop_ui_config_cache.cjs`.
- Remove cache mirror calls from `ipc.cjs`.
- Remove tests that assert the cache helper exists.
- Replace cache-specific docs language with store authority language.
- Delete startup promotion logic whose only purpose was cache hydration if the
  store now owns renderer/disk merge persistence directly.

Deletion targets:

- `createDesktopUiConfigCache(...)`
- `getRaw()` / `set()` cache callsites
- cache-specific "latest config" preservation wording
- regression tests that protect cache helper extraction rather than behavior

### Phase 4: Tighten Store Contracts

- Make `load-frontend-config` return the store snapshot after hydrate.
- Make `save-frontend-config` return the post-save store snapshot/status.
- Keep all snapshots cloned so consumers cannot mutate store state.
- Add an invariant test that mutating a returned snapshot cannot change
  query-time Agent config.
- Add a user-facing regression pack route for Agent settings source-of-truth
  behavior.

## Tests To Add Or Update

Focused tests:

- `tests/frontend/IpcDesktopUiConfigStore.test.cjs`
- `tests/frontend/IpcDesktopUiConfigHandlers.test.cjs`
- `tests/frontend/IpcDesktopUiConfigPersistenceRuntime.test.cjs`
- `tests/frontend/IpcSettingsSyncRuntime.test.cjs`
- `tests/frontend/IpcAgentDefinitionContext.test.cjs`
- `tests/frontend/IpcChatQueryHandlers.test.cjs`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

User-facing regression pack:

- Add an Agent settings source-of-truth route that covers:
  - custom system prompt replacement
  - disabled local tool policy
  - disabled remote tool policy
  - first query after restart
  - next query after just-edited settings

## Docs To Update

- `docs/frontend/runtime/config_sync_and_settings_lifecycle_reference.md`
- `docs/frontend/main/ipc_helper_module_split_and_runtime_boundary_reference.md`
- `docs/frontend/renderer/settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md`
- `docs/sdk/agent_definition.md`
- `docs/debug/user_facing_regression_pack.md`
- `docs/security/credentials_and_tokens_matrix.md`

## Compatibility And Migration

No user data migration should be required.

Existing `frontend-config.json` and encrypted provider credential side files
remain valid. On startup, the store hydrates from those existing files and
renderer still promotes localStorage-only settings through the normal
`save-frontend-config` path until localStorage-only Agent settings are no
longer possible.

The runtime migration is internal to Electron main. Public backend
`agent_definition`, settings update payloads, provider credential storage
format, and renderer config keys should not change.

## Security Notes

- The store must never retain raw provider API keys in the desktop UI config
  snapshot.
- Raw provider API keys may cross local IPC only for Electron main encrypted
  credential persistence.
- Disk config remains redacted.
- Diagnostics must report counts, provider ids, and enabled flags only, not raw
  keys, prompt text, tool arguments, file paths, screenshots, or user message
  content.
- Query-time Agent definition reads must use sanitized store snapshots.

## Completion Criteria

This plan is complete when:

- `ipc_desktop_ui_config_cache.cjs` is deleted.
- Query-time Agent definition assembly reads the main-owned store directly.
- Renderer settings edits affect the next query without relying on disk timing.
- First query after restart uses persisted Agent prompt/tool settings.
- Provider credential persistence still stores secrets only in encrypted
  safeStorage.
- User-facing regression coverage protects Agent settings source-of-truth
  behavior.
- Docs describe one Electron-main desktop UI config store authority, with disk
  as persistence only.
