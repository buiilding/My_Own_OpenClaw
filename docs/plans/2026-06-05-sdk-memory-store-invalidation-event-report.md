---
summary: "Realtime implementation report for the SDK memory store invalidation event plan."
read_when:
  - When continuing or reviewing SDK-owned memory store invalidation events and Memory panel refresh behavior.
title: "SDK Memory Store Invalidation Event Report"
---

# SDK Memory Store Invalidation Event Report

Plan: [SDK Memory Store Invalidation Event Plan](2026-06-05-sdk-memory-store-invalidation-event-plan.md)

## Status

Complete.

## User Intent

Implement the approved SDK memory store invalidation event plan so completed-turn
memory persistence refreshes open Memory panel surfaces without relying on the
old completed-turn memory diagnostic event.

## Inspection Log

- Pulled `origin/main`; fast-forward was not possible because local `main` was
  ahead by two commits and remote `main` had the plan commit.
- Merged `origin/main` with `--no-ff`; merge created
  `docs/plans/2026-06-05-sdk-memory-store-invalidation-event-plan.md`.
- Ran `./bin/docs-list`.
- Read `docs/docs.json`, `docs/getting-started/docs_directory.md`,
  `docs/sdk/windie_client_runtime.md`, `docs/sdk/conversation_runtime.md`,
  `docs/architecture/storage_persistence_change_workflow.md`,
  `docs/memory/memory_change_workflow.md`, and
  `docs/architecture/data_flow_and_state_ownership.md`.
- Inspected recent related commits for SDK/main/renderer boundaries:
  `2b425324a`, `c90c14018`, `2237d8a3e`, `59f3d230b`, and the plan commit
  `0e1d3b9c9`.
- Found `ConversationRuntime.persistCompletedTurnMemory()` emits
  `memory_persistence_diagnostic` for success, skip, and failure cases.
- Found the Memory panel loads through `DesktopMemoryRuntimeClient` but does not
  subscribe to any SDK memory-store invalidation channel.
- Found Electron main forwards SDK conversation events, rows, and current-turn
  projections, but has no dedicated `windie:memory-store-changed` channel.
- Implementation pass added the SDK event type/payload, emitted it only after
  successful completed-turn episodic persistence, forwarded it from Electron
  main, subscribed in `MemorySection`, and updated focused tests/docs.
- Final design-inspection pass reread the SDK runtime, Electron forwarding, and
  Memory panel subscription paths. No remaining in-scope duplicate memory
  refresh path or completed-turn persistence diagnostic event producer was
  found outside the approved plan/report text.

## Checklist

- [x] SDK event type and payload added.
- [x] SDK emits event after successful completed-turn memory persistence.
- [x] SDK skip/failure behavior does not emit false invalidation.
- [x] Old completed-turn `memory_persistence_diagnostic` event path removed or
      explicitly replaced with a clearer approved failure/status path.
- [x] Electron main forwards the event on a dedicated memory-store channel.
- [x] Shared IPC/preload channel allowlists include the new channel.
- [x] Memory panel refreshes from the invalidation event.
- [x] Renderer does not use `memory_persistence_diagnostic` as the refresh
      contract.
- [x] Tests/docs no longer present `memory_persistence_diagnostic` as the
      completed-turn memory contract.
- [x] Focused tests added or updated.
- [x] Docs updated.
- [x] `CHANGELOG.md` updated.
- [x] Validation results recorded in this report.
- [x] Commit created and recorded in this report.

## Decisions

- Keep non-success completed-turn memory persistence intentionally quiet in the
  conversation event log for this slice. Failure details remain in SDK warning
  logs and lower-level helper diagnostics for direct helper tests; no memory
  invalidation is emitted for skipped or failed persistence.

## Validation Log

- `./bin/docs-list`: passed.
- `git diff --check`: passed. Warnings only about LF-to-CRLF normalization in
  the Windows worktree.
- `cd frontend && npm.cmd run test -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/MemorySection.test.jsx ../tests/frontend/IpcChannels.test.ts ../tests/frontend/PreloadIpcChannels.test.cjs --watch=false`:
  passed, 4 suites / 111 tests.
- `cd packages/windie-sdk-js && npm.cmd run build`: failed because `tsc` was
  not on the package-local PATH.
- `cd packages/windie-sdk-js && PATH=<repo>/frontend/node_modules/.bin:$PATH npm.cmd run build`:
  passed; regenerated ESM/CJS package output.
- `cd frontend && npm.cmd run typecheck`: failed with existing dependency
  resolution error
  `../packages/windie-sdk-js/src/transport/WindieAgentSession.ts(421,27): Cannot find module 'ws' or its corresponding type declarations.`

## Commits

- `3da3057a3` - `fix(frontend): refresh memory panel from sdk invalidation`
