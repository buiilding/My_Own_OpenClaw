---
summary: "Execution report for the 2026-06-05 deterministic codebase cleanup campaign."
read_when:
  - When reviewing cleanup slices from the deterministic codebase cleanup campaign.
  - When continuing candidate discovery for stale fallbacks, compatibility shims, duplicate producers, or branch-heavy runtime paths.
title: "Deterministic Codebase Cleanup Campaign Report"
---

# Deterministic Codebase Cleanup Campaign Report

Plan: [Deterministic Codebase Cleanup Campaign Plan](2026-06-05-deterministic-codebase-cleanup-campaign-plan.md)

Date: 2026-06-05

## Baseline

- Initial branch/status: `## main...origin/main`
- Initial dirty files: none.
- Docs navigation checked: `docs/docs.json`, `docs/getting-started/docs_directory.md`.
- Docs listing: `./bin/docs-list` ran and failed because `docs/docs.json` references missing pages that are not present in the checkout. This is recorded as pre-existing docs-index debt.
- Recent commits inspected: `47a180ffd`, `d01f92bb1`, `17ef21c66`, `629d435c0`, `8d073f27`, plus focused history for websocket task scheduling.

## Candidate Ledger

| ID | Subsystem / owner | Suspected stale path | Producer / consumer | Evidence | Recent commits inspected | Concept | Risk | Validation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-001 | Backend API websocket | `TaskManager.create_task_if_under_limit` returns a task object production discards | `TaskManager` produces tasks; `loop_runtime.schedule_validated_message_task` only needs admission | `loop_runtime.py` assigned `_ = task`; dedicated plan `2026-06-05-backend-websocket-task-admission-cleanup-plan.md` | `76c01c5ac`, `930644576`, `13b53f682`, `f655d3a46` | Return boolean admission result and assert task ownership through `active_tasks` | Low, internal helper only | websocket task manager and loop runtime tests | implemented |
| C-002 | Docs / SDK runtime | Stale `WindieDesktopAgent` references after runtime deletion | SDK now exposes `WindieClient.wakeUp`; docs/tests still mention deleted desktop facade | `rg WindieDesktopAgent` finds docs references while source file is deleted | `47a180ffd`, `29de210dd`, `289fd8cb6` | Update active docs to current SDK runtime owner or mark historical plan references only | Medium, docs-only but broad | `rg WindieDesktopAgent`, docs-list, diff check | queued |
| C-003 | Docs / minimal chat pill | Stale `ChatBoxApp` / `ChatBoxResponseApp` paths after rename to `Minimal*` apps | Renderer app files moved; docs still describe old file names as canonical | `rg ChatBoxApp ChatBoxResponseApp docs` finds active desktop docs | `47a180ffd`, `29de210dd` | Align active desktop docs with renamed minimal pill files; leave explicit historical plan references alone | Low, docs-only | targeted `rg`, docs-list, diff check | queued |
| C-004 | Frontend renderer artifact utilities | Frontend still normalizes `image/jpg` alias after backend artifact uploads removed it | Backend rejects non-canonical `image/jpg`; renderer utility keeps alias path | `ArtifactImageUtils.ts` maps `image/jpg`; changelog says backend removed alias | `a483bc291`, `47a180ffd` | Verify live callers/tests, then remove alias or document why renderer display still accepts old stored metadata | Medium, stored artifact display compatibility possible | frontend artifact/image utility tests | investigating |
| C-005 | Sidecar system tool | `stats_tool.get_system_stats(args)` keeps unused args for interface consistency | Tool registry likely invokes entrypoints with args dict; implementation ignores it | `rg unused` finds `stats_tool.py` docstring note | recent sidecar tool commits pending inspection | Verify registry entrypoint contract before narrowing or reject as required plugin/tool ABI | Medium, sidecar tool ABI risk | sidecar system/tool registry tests | queued |
| C-006 | Backend core types | Legacy plugin result dictionary types marked unused | Runtime may no longer import plugin dict result types | `backend/src/core/types/schemas.py` says "Legacy Plugin Types (unused)" | recent core type commits pending inspection | Verify imports and remove unused legacy type block if no public contract | Medium, type import compatibility possible | backend type/import tests and `rg` | queued |

## Slice Log

### C-001 Backend Websocket Task Admission

- Owner: backend API websocket `TaskManager`.
- Intended path: `TaskManager` owns task creation/tracking; receive-loop code only branches on accepted/rejected scheduling.
- Previous behavior: scheduling returned `(task_or_none, limit_exceeded)` and production discarded the accepted task object.
- Current behavior: scheduling returns `True` for accepted and `False` for limit rejection. Accepted tasks remain tracked internally in `active_tasks`.
- Docs read: backend API route workflow, websocket parse/task scheduling reference, task manager concurrency/cleanup reference, backend websocket task-admission plan.
- Recent commits inspected: `bd11811ac`, `923f8bc2d`, `76c01c5ac`, `f8c29295d`, `89255d347`, `930644576`, `13b53f682`, `f655d3a46`.
- Validation:
  - `./scripts/python-in-env backend pytest tests/backend/test_websocket_task_manager.py tests/backend/test_websocket_loop_runtime.py -q` passed.
  - `./scripts/python-in-env backend pytest tests/backend/test_websocket_task_manager.py tests/backend/test_websocket_loop_runtime.py tests/backend/test_websocket_route.py -q` passed.
  - `rg -n "create_task_if_under_limit\(|limit_exceeded|_ = task|\(None, True\)|\(task, False\)|task_or_none" backend/src tests/backend docs` found only current method/test names plus historical plan/report references; no production `_ = task`, tuple return, or old route-test return shape remains.
  - `./bin/docs-list` failed on the pre-existing `docs/docs.json` missing-page references recorded in the baseline.
  - `git diff --check` passed with Windows line-ending warnings only.
- Commit: pending.

## Campaign Checklist

- [x] Report file exists and links this plan.
- [x] Initial dirty worktree snapshot is recorded.
- [x] Candidate ledger starts with at least five candidates across at least two runtimes.
- [x] Candidate scans use docs, `rg`, tests, and recent commits.
- [x] C-001 names the owner, stale path, deletion, tests, docs, and validation before implementation.
- [x] C-001 removes or simplifies more code than it adds.
- [x] No unrelated dirty files are staged or reverted.
- [x] Changelog is updated for C-001.
- [x] Docs are updated for C-001 ownership and contract changes.
- [ ] C-001 commit recorded.
- [ ] At least four subsystems are scanned before declaring the campaign exhausted.
- [ ] The campaign does not stop after one narrow cleanup unless explicitly blocked or redirected.
