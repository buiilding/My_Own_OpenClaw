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

## Commit Ledger

Counted cleanup commits: 0 / 25.

| # | Commit | Candidate | Validation | Notes |
| --- | --- | --- | --- | --- |

## Validation Log

- `bin/windie docs list` passed during orientation.
- `bin/windie test frontend -- ChatGptDashboardShell ChatInterfaceWiring UseDashboardConversations` passed before the baseline frontend fix commit: 3 suites, 96 tests.

## Current Status

P25-001 is the first approved cleanup slice.
