---
summary: "Plan to unify local WindieOS durable storage under one windieos user-data folder."
read_when:
  - When changing local storage roots, app data paths, sidecar memory/history paths, diagnostics storage, backend artifact defaults, browser profiles, or reinstall reset behavior.
title: "Unified WindieOS Storage Root Plan"
---

# Unified WindieOS Storage Root Plan

## User Intent

All local WindieOS data should live under one app-data folder named `windieos`.
The current split across `desktop-assistant`, `DesktopAssistant`, `WindieOS`,
repo-local dev files, and Electron's packaged `windieos` user-data folder makes
reinstall/debug behavior ambiguous.

The user has deleted old `memory/` and `history/` data under
`~/Library/Application Support/desktop-assistant`, so this plan should not
preserve that old memory/history path as a compatibility source.

## Target Architecture

- The single durable local app-data root is `windieos`.
- Electron main continues to use `app.getPath('userData')`; packaged app data
  already resolves to `~/Library/Application Support/windieos` on this machine.
- Python sidecar-owned durable stores move beneath the same root:
  - `windieos/history/history.db`
  - `windieos/memory/episodic.db`
  - `windieos/memory/semantic.db`
  - `windieos/memory/*.faiss.index`
  - `windieos/diagnostics/diagnostics.db`
  - `windieos/browser-use`
  - `windieos/sidecar_feature_packs`
  - `windieos/wakeword/models`
- Browser automation uses the same lower-case `windieos/BrowserProfile` root.
- Backend local defaults use `windieos/artifacts`, `windieos/install-auth.sqlite3`,
  and `windieos/tts_models`.
- CLI inspection commands use the unified root.

## Out Of Scope

- Migrating already-deleted `desktop-assistant/memory` or
  `desktop-assistant/history` rows.
- Renaming browser localStorage keys such as `desktop-assistant-config`; those
  are keys inside Electron user-data storage, not separate filesystem roots.
- Deleting user files from old folders automatically. Code should stop creating
  and reading old roots; manual cleanup can happen after validation.
- Changing hosted backend storage paths configured explicitly by environment or
  deployment config.

## Workflow

1. Add small path helpers where needed instead of duplicating platform-specific
   `Application Support` construction.
2. Move sidecar default path construction from `desktop-assistant` to `windieos`.
3. Move app diagnostics default DB path from `desktop-assistant` to `windieos`.
4. Move CLI history and diagnostics inspection to the unified root.
5. Move browser-use and dedicated Chrome profile defaults to the unified root.
6. Move wakeword model downloads to the unified root.
7. Move backend local defaults from `DesktopAssistant` to `windieos`.
8. Update focused tests that assert local paths.
9. Update docs that tell users where reset/debug data lives.
10. Run focused validation, then inspect for remaining old filesystem-root
   references and classify each as fixed or intentionally out of scope.

## Success Criteria

- No runtime code creates default durable local data under `desktop-assistant`,
  `DesktopAssistant`, or `WindieOS`.
- CLI commands inspect `windieos/history/history.db` and only use old paths in
  tests or historical plan/report docs.
- Sidecar memory/history tests assert `windieos` root behavior.
- Backend config tests assert `windieos` artifact/install-auth/TTS defaults.
- Docs for reset/debug paths name `windieos` as the local data root.
- A final search inventories remaining old-name references and explains any
  intentionally retained references.

## Validation

- `bin/windie docs list`
- `bin/windie test frontend -- AppDiagnosticsStore.test.cjs WindieCli.test.cjs MainWindowRuntime.test.cjs`
- `bin/windie test sidecar -- tests/sidecar/test_local_store_init.py tests/sidecar/tools/test_chrome_launcher.py -q`
- `bin/windie test backend -- tests/backend/test_config_models.py tests/backend/test_config_loader.py -q`
- `git diff --check`

## Reread Anchors

- `pending/compaction_safe_plan_execution.md`
- `docs/architecture/storage_persistence_change_workflow.md`
- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/diagnostics/app_diagnostics_store.cjs`
- `scripts/windie/commands.cjs`
- `backend/src/core/config/models.py`
- `backend/src/core/config/loader.py`
