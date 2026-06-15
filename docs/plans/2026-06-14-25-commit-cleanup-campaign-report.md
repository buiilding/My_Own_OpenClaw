---
summary: "Execution report for the 2026-06-14 at-least-25 cleanup commit campaign."
read_when:
  - When reviewing progress toward the 25 cleanup commit goal.
  - When continuing deletion of unused code, legacy paths, compatibility shims, or stale active docs.
title: "25 Commit Cleanup Campaign Report"
---

# 25 Commit Cleanup Campaign Report

Plan: [25 Commit Cleanup Campaign Plan](2026-06-14-25-commit-cleanup-campaign-plan.md)

Date: 2026-06-14

## Baseline

- Branch: `main`.
- Dirty files after baseline frontend fix commit: none.
- Docs listing: `bin/windie docs list` succeeded.
- Orientation docs read:
  - `docs/development/agent_runtime_ownership_and_change_routing.md`
  - `pending/compaction_safe_plan_execution.md`
  - `docs/plans/2026-06-05-deterministic-codebase-cleanup-campaign-plan.md`
  - `docs/plans/2026-06-05-deterministic-codebase-cleanup-campaign-report.md`
- Existing non-campaign setup commit made before this report:
  - `37d4fdfa5` (`fix(frontend-chat): show loading state for selected history`)

## Candidate Ledger

| ID | Owner | Suspected stale path | Evidence | Concept | Status |
| --- | --- | --- | --- | --- | --- |
| P25-001 | Electron main platform policy | `frontend/src/main/platform/content_protection/macos.cjs` and `windows.cjs` only re-export `supported.cjs` | `rg "module.exports = require"` found both wrappers; index only needs platform dispatch | Delete wrappers and return shared supported runtime directly for darwin/win32 | approved-slice |
| P25-002 | Backend core types | `backend/src/core/types/aliases.py` exports `JSONDict`/`StringDict` with no code or test consumers | `rg JSONDict StringDict` finds only docs, the alias module, and package export | Delete unused alias module and package export; update active core docs | queued |
| P25-003 | SDK/runtime docs | Active docs still route SDK/main work to deleted `WindieDesktopAgent.ts` | `rg WindieDesktopAgent docs --glob '!docs/plans/**'` finds active workflow/reference pages | Replace active references with current `WindieAgent`/`WindieClient` runtime owners | queued |
| P25-004 | Renderer docs | Active docs still mention deleted `view=chatbox` or `useChatBoxBindings` paths | Targeted `rg` finds active docs references outside historical plans | Align active docs with minimal view and hook names | queued |
| P25-005 | Electron main screenshot visibility | Per-platform screenshot visibility modules all execute `task()` directly | Code inspection and existing tests show Windows/Linux runtimes are no-op; docs describe all platform modules as pass-through wrappers | Collapse to one shared pass-through runtime in `index.cjs`; delete per-OS no-op modules | approved-slice |

## Commit Ledger

Counted cleanup commits: 22 / 25.

| # | Commit | Candidate | Validation | Notes |
| --- | --- | --- | --- | --- |
| 1 | `b632e4832` | P25-001 | `node -c frontend/src/main/platform/content_protection/index.cjs`; `node -c frontend/src/main/platform/content_protection/supported.cjs`; `node -c frontend/src/main/platform/content_protection/linux.cjs`; `bin/windie test frontend -- WindowPlatformPolicy`; targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed macOS/Windows content-protection wrapper modules. |
| 2 | `ce9385e86` | P25-002 | `./scripts/python-in-env backend python -c "import backend.src.core.types as t; assert 'JSONDict' not in t.__all__; assert 'StringDict' not in t.__all__; import backend.src.core.types.schemas"`; `./scripts/python-in-env backend pytest tests/backend/test_messages_and_converters.py -q`; targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed unused backend core type aliases. |
| 3 | `bd2356e7b` | P25-005 | `node -c frontend/src/main/platform/screenshot_window_visibility/index.cjs`; `bin/windie test frontend -- LocalBackendBridgeWindowVisibility`; targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed no-op screenshot visibility platform modules. |
| 4 | `703b2afad` | P25-003 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed active docs references to deleted SDK desktop-agent path and tests. |
| 5 | `b5b7cd0e0` | P25-004 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed active docs references to deleted ChatBox overlay component paths and old chatbox routes. |
| 6 | `2d47f6c9f` | P25-006 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active docs to moved Electron main surface modules. |
| 7 | `791e543a7` | P25-007 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active display-affinity docs to the moved surfaces owner. |
| 8 | `b6a3a57c5` | P25-008 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active permission docs to moved permissions modules. |
| 9 | `80a4ba560` | P25-009 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active overlay and window-surface docs to moved surfaces modules. |
| 10 | `42a813e0f` | P25-010 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active app-runtime docs to moved app modules. |
| 11 | `5d6399387` | P25-011 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active main SDK-runtime docs to moved SDK modules. |
| 12 | `804839cdf` | P25-012 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active wakeword docs to moved wakeword modules. |
| 13 | `62cf39266` | P25-013 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active chat-pill trace docs to the moved debug module. |
| 14 | `cfcc64c61` | P25-014 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed stale active query-builder docs and routed enrichment ownership to the SDK. |
| 15 | `0cfb0c08c` | P25-015 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed stale SDK command-forwarding helper docs and routed query sends to the current helper. |
| 16 | `30a0fd46b` | P25-016 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active platform permission docs to the current permission IPC runtime. |
| 17 | `fd71c909a` | P25-017 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Routed active platform packaging docs to current sidecar runtime path and launch-option owners. |
| 18 | `a94de20b2` | P25-018 | `bin/windie test frontend -- WindieSdkConversationRuntime WindieSdkPackageBoundary`; targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed unused SDK Electron tool-event router duplicate. |
| 19 | `58f77e395` | P25-019 | `bin/windie test frontend -- WindieSdkClient WindieSdkPackageBoundary`; `tsc -p packages/windie-sdk-js/tsconfig.build.json --noEmit`; targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed the `WindieClientOptions.localRuntime` alias from the SDK source and docs. |
| 20 | `f89761708` | P25-020 | `node -c packages/windie-sdk-js/cjs/runtime/WindieClient.js`; `bin/windie test frontend -- WindieSdkPackageBoundary WindieSdkClientExports`; targeted `rg`; `bin/windie docs list`; `git diff --check` | Synced the checked-in CommonJS SDK runtime with the local-runtime option alias removal. |
| 21 | `d0d9ed8eb` | P25-021 | `bin/windie test frontend -- WindieSdkConversationRuntime WindieSdkPackageBoundary ChatSurfaceController`; `tsc -p packages/windie-sdk-js/tsconfig.build.json --noEmit`; `node -c packages/windie-sdk-js/cjs/runtime/ConversationRuntime.js`; targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed the `ConversationSnapshot.liveTurnPresentation` alias. |
| 22 | `21cee7732` | P25-022 | targeted `rg`; `bin/windie docs list`; `git diff --check` | Removed stale active sidecar memory runtime docs, deleted the obsolete heuristic-title doc page, and routed test references to current files. |

## Validation Log

- `bin/windie docs list` passed during orientation.
- `bin/windie test frontend -- ChatGptDashboardShell ChatInterfaceWiring UseDashboardConversations` passed before the baseline frontend fix commit: 3 suites, 96 tests.

## Current Status

P25-001 through P25-022 are committed. P25-023 is in progress.
