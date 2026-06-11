---
summary: "Implementation report for unifying WindieOS local durable storage under the windieos user-data root."
read_when:
  - When resuming or validating unified WindieOS storage root work.
title: "Unified WindieOS Storage Root Report"
---

# Unified WindieOS Storage Root Report

Plan: [Unified WindieOS Storage Root Plan](2026-06-11-unified-windieos-storage-root-plan.md)

## Status

Complete.

## Checklist

- [x] Update sidecar memory/history root.
- [x] Update diagnostics DB root.
- [x] Update CLI history/diagnostics lookup.
- [x] Update browser-use and dedicated Chrome profile roots.
- [x] Update backend artifact/install-auth/TTS defaults.
- [x] Update docs and tests.
- [x] Run focused validation.
- [x] Perform final old-root inventory and classify remaining references.
- [x] Commit completed changes.

## Decisions

- 2026-06-11: The target root is lower-case `windieos`, matching the packaged
  Electron app's current user-data folder on this machine.
- 2026-06-11: The user has deleted old `memory/` and `history/` data under
  `desktop-assistant`, so runtime compatibility fallback to those paths is out
  of scope.
- 2026-06-11: LocalStorage key names containing `desktop-assistant` are not a
  separate filesystem root and are not part of this cleanup unless a test shows
  they create cross-folder persistence.
- 2026-06-11: No runtime fallback to old memory/history roots was added. This
  intentionally fails fast into the new `windieos` root instead of preserving a
  second source of truth.
- 2026-06-11: The macOS reinstall reset script remains a destructive reset path
  and now removes known old app-state roots so local reinstall loops do not
  leave duplicate folders.

## Validation Log

- 2026-06-11: `bin/windie docs list` passed.
- 2026-06-11: `bin/windie test frontend -- AppDiagnosticsStore.test.cjs WindieCli.test.cjs MainWindowRuntime.test.cjs` passed: 3 suites, 61 tests.
- 2026-06-11: `bin/windie test sidecar -- tests/sidecar/test_local_store_init.py tests/sidecar/tools/test_chrome_launcher.py -q` passed.
- 2026-06-11: `bin/windie test backend -- tests/backend/test_config_models.py tests/backend/test_config_loader.py -q` passed: 46 tests.
- 2026-06-11: `bin/windie diagnostics list --path conversation.metadata.list --limit 1 --json` passed and reported `/Users/peterbui/Library/Application Support/windieos/diagnostics/diagnostics.db`.
- 2026-06-11: `bin/windie conversation messages conv-does-not-exist --json` passed and reported `/Users/peterbui/Library/Application Support/windieos/history/history.db`.
- 2026-06-11: `bin/windie test sidecar -- tests/sidecar/test_local_store_init.py tests/sidecar/tools/test_chrome_launcher.py tests/sidecar/test_wakeword_service.py -q` passed.
- 2026-06-11: `git diff --check` passed.

## Inspection Log

- 2026-06-11: Initial inventory found runtime default roots in sidecar memory,
  app diagnostics, CLI history lookup, browser-use, dedicated Chrome profile,
  backend artifact defaults, backend TTS defaults, reset docs, and path tests.
- 2026-06-11: Final runtime inventory found no remaining old filesystem root
  defaults in `frontend/src/main/python`, `backend/src`, `scripts/windie`, or
  focused tests. Remaining `desktop-assistant` hits are localStorage key names,
  old Linux package identifiers, historical plan/report text, or legacy cleanup
  paths in `scripts/reinstall-windieos-macos.sh`.
- 2026-06-11: Live disk inspection still showed old app-support folders on this
  machine, but runtime defaults now create and inspect `windieos`; on-disk
  deletion/movement of existing user files was not performed as part of code
  implementation.

## Commits

- `c15f60cc7` - `fix(storage): unify local data root`
