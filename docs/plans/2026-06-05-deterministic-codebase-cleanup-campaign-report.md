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
| C-003 | Docs / minimal chat pill | Stale `ChatBoxApp` / `ChatBoxResponseApp` paths after rename to `Minimal*` apps | Renderer app files moved; docs still describe old file names as canonical | `rg ChatBoxApp ChatBoxResponseApp docs` finds active desktop docs | `47a180ffd`, `29de210dd` | Align active desktop docs with renamed minimal pill files; leave explicit historical plan references alone | Low, docs-only | targeted `rg`, docs-list, diff check | implemented |
| C-004 | Frontend renderer artifact utilities | Frontend still normalizes `image/jpg` alias after backend artifact uploads removed it | Backend rejects non-canonical `image/jpg`; renderer utility keeps alias path | `ArtifactImageUtils.ts` maps `image/jpg`; changelog says backend removed alias | `a483bc291`, `47a180ffd` | Verify live callers/tests, then remove alias or document why renderer display still accepts old stored metadata | Medium, stored artifact display compatibility possible | frontend artifact/image utility tests | investigating |
| C-005 | Sidecar system tool | `stats_tool.get_system_stats(args)` keeps unused args for interface consistency | Tool registry likely invokes entrypoints with args dict; implementation ignores it | `rg unused` finds `stats_tool.py` docstring note | recent sidecar tool commits pending inspection | Verify registry entrypoint contract before narrowing or reject as required plugin/tool ABI | Medium, sidecar tool ABI risk | sidecar system/tool registry tests | queued |
| C-006 | Backend core types | Legacy plugin result dictionary types marked unused | Runtime may no longer import plugin dict result types | `backend/src/core/types/schemas.py` says "Legacy Plugin Types (unused)" | `43677c89d`, `dfc27b7ea`, `9ad4d1591`, `e4655863c` | Remove unused legacy type block and package export | Low after `rg` showed only self-export references | backend type import smoke and `rg` | implemented |
| C-007 | Frontend docs inventory | Broader frontend docs still name old `ChatBox*` app/component paths | Active docs inventory and workflow pages consume renderer source-map paths | Broad `rg` after C-003 found stale paths outside `docs/desktop` | `47a180ffd`, `29de210dd` | Refresh frontend inventory/workflow docs in a separate docs slice, excluding historical plan files | Medium, docs-only but broad | targeted docs `rg`, docs-list, diff check | queued |
| C-008 | Frontend main | `local_backend_bridge_windows.cjs` only re-exports `local_backend_bridge_window_visibility.cjs` | Window visibility owner module implements helpers; two callers import through alias wrapper | `local_backend_bridge_windows.cjs` contains only `module.exports = require(...)`; `rg` finds two runtime imports and one workflow doc mention | `034790787`, `47a180ffd`, `29de210dd` | Delete wrapper and import owner module directly | Low, direct require path change | frontend local backend bridge/window tests and `rg` | implemented |

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
- Commit: `79ecbcf24` (`refactor(backend-api): narrow websocket task admission`).

### C-003 Desktop Minimal Pill Docs

- Owner: docs for desktop renderer surfaces.
- Intended path: active docs point to current minimal pill app/component names while stable URL route names remain `?view=chatbox` and `?view=chatbox-response`.
- Previous behavior: active desktop docs named deleted or renamed `ChatBoxApp`, `ChatBoxResponseApp`, `ChatBox`, `ChatBoxResponse`, and `useChatBoxBindings` files as canonical.
- Current behavior: active desktop docs name `MinimalChatPillApp`, `MinimalResponseOverlayApp`, `MinimalChatPill`, `MinimalResponseOverlay`, and minimal-pillar hook paths.
- Docs read: desktop surfaces hub, chat pill guide, response overlay guide.
- Recent commits inspected: `47a180ffd`, `29de210dd`, `289fd8cb6`, `366f70ec2`.
- Validation:
  - `rg -n "ChatBoxApp|ChatBoxResponseApp|features/chat/components/ChatBox\.jsx|features/chat/components/ChatBoxResponse\.jsx|useChatBoxBindings" docs/desktop` returned no matches.
  - Broader docs scan still found stale frontend docs inventory/workflow references; recorded as C-007 instead of widening this slice.
  - `./bin/docs-list` failed on the pre-existing `docs/docs.json` missing-page references recorded in the baseline.
  - `git diff --check` passed with Windows line-ending warnings only.
- Commit: `15cf9b279` (`docs(desktop): align minimal pill surface paths`).

### C-006 Backend Core Legacy Plugin Type

- Owner: backend core type package.
- Intended path: core types expose current runtime message, tool, memory, and schema shapes only.
- Previous behavior: `PluginResultDict` was marked as a legacy unused plugin result shape and re-exported from `backend.src.core.types`.
- Current behavior: the unused type and re-export are deleted.
- Docs read: root repository guide and docs directory for routing; no behavior docs required because this is an unused type-surface deletion.
- Recent commits inspected: `43677c89d`, `dfc27b7ea`, `9ad4d1591`, `e4655863c`.
- Validation:
  - `rg -n "PluginResultDict|Legacy Plugin Types" backend/src tests docs --glob '!docs/plans/2026-06-05-deterministic-codebase-cleanup-campaign-report.md'` returned no matches.
  - `./scripts/python-in-env backend python -c "import backend.src.core.types as t; assert 'PluginResultDict' not in t.__all__; import backend.src.core.types.schemas"` passed.
  - `./scripts/python-in-env backend pytest tests/backend/test_formatter_specs_contract.py -q` passed.
  - `./bin/docs-list` failed on the pre-existing `docs/docs.json` missing-page references recorded in the baseline.
  - `git diff --check` passed with Windows line-ending warnings only.
- Commit: `52a292f31` (`refactor(backend-core): remove legacy plugin result type`).

### C-004 Frontend Artifact `image/jpg`

- Status: rejected.
- Reason: frontend normalization of `image/jpg` to canonical `image/jpeg` is a boundary normalizer for user/file/clipboard metadata before upload naming. Backend upload still rejects direct non-canonical API input with HTTP 415. Deleting the frontend normalizer would make user-originated metadata less robust without removing a backend compatibility path.
- Evidence: `tests/frontend/ArtifactImageUtils.test.ts` covers `IMAGE/JPG` normalization; backend commit `14c865af7` removed the server-side alias and documents fail-fast API behavior.

### C-005 Sidecar System Stats Args

- Status: rejected.
- Reason: built-in sidecar tools are invoked through `ToolRegistry.execute_tool(tool_name, args)`, which calls coroutine tools as `await tool(args)`. The unused `args` parameter on `get_system_stats` is part of that built-in entrypoint ABI, not dead behavior.
- Evidence: `frontend/src/main/python/tools/registry.py` lazy built-in wrapper calls `resolved_tool(args)`; sidecar registry docs describe `tool(args)` dispatch.

### C-008 Frontend Main Window Visibility Wrapper

- Owner: Electron main local-backend bridge window visibility helpers.
- Intended path: callers import `local_backend_bridge_window_visibility.cjs`, the owner module that implements resolver and screenshot-hide helpers.
- Previous behavior: `local_backend_bridge_windows.cjs` existed only as a package-local rename-and-forward wrapper, and two callers imported through it.
- Current behavior: the wrapper is deleted; callers and workflow docs point at the owner module directly.
- Docs read: main-process change workflow.
- Recent commits inspected: `034790787`, `47a180ffd`, `29de210dd`.
- Validation:
  - `rg -n "local_backend_bridge_windows" frontend/src/main tests/frontend docs CHANGELOG.md` found no runtime/test references; remaining matches are this report, historical planning/changelog entries, and the new changelog note.
  - `cd frontend; $env:NODE_OPTIONS='--no-deprecation'; npx.cmd jest --config jest.config.cjs --runInBand LocalBackendBridgeWindowVisibility LocalBackendBridgeExtensionRuntime LocalBackendBridge.rpc` passed: 3 suites, 45 tests.
  - `npm.cmd run test:ci -- LocalBackendBridgeWindowVisibility LocalBackendBridgeExtensionRuntime LocalBackendBridge.rpc` could not launch on Windows because the package script uses POSIX `NODE_OPTIONS=...` assignment syntax.
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
- [x] C-001 commit recorded.
- [x] C-003 names the owner, stale path, deletion, tests, docs, and validation before implementation.
- [x] C-003 removes stale docs without adding a compatibility layer.
- [x] C-006 names the owner, stale path, deletion, tests, docs, and validation before implementation.
- [x] C-006 removes unused exported type surface.
- [x] C-004 rejected with evidence.
- [x] C-005 rejected with evidence.
- [x] C-008 names the owner, stale path, deletion, tests, docs, and validation before implementation.
- [x] C-008 deletes a wrapper instead of adding an adapter.
- [ ] At least four subsystems are scanned before declaring the campaign exhausted.
- [ ] The campaign does not stop after one narrow cleanup unless explicitly blocked or redirected.
