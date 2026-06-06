---
summary: "Realtime implementation report for the Memory and rehydrate single-source paths plan."
read_when:
  - When continuing or reviewing Memory panel, SDK display projection, backend rehydrate, or current-turn source-of-truth cleanup.
title: "Memory And Rehydrate Single Source Paths Report"
---

# Memory And Rehydrate Single Source Paths Report

Plan: [Memory And Rehydrate Single Source Paths Plan](2026-06-05-memory-and-rehydrate-single-source-paths-plan.md)

## Status

Complete.

## User Intent

Implement the approved plan so Memory panel, conversation history display,
backend rehydrate, and live streaming each have one canonical source and one
path. Memory display should use SDK memory APIs over sidecar memory rows.
Historical conversation display and backend rehydrate should use SDK
projections over `chat_events`. Live streamed assistant text should use
`currentTurn`, not historical `displayRows`.

## Inspection Log

- Ran `./bin/docs-list` while creating the plan.
- Read the approved plan, `docs/sdk/conversation_runtime.md`, and
  `docs/architecture/memory_system.md`.
- Checked `git status --short --branch`; branch is ahead of `origin/main` by
  one commit and the plan file is untracked before implementation. Existing
  untracked CLI files from another task are being preserved.
- Inspected recent commits touching memory/runtime/projection paths:
  `aca83dec0`, `3da3057a3`, `c90c14018`, `2237d8a3e`, `3b82937a2`,
  `59f3d230b`, `0f3bec959`, and `47a180ffd`.
- Confirmed `WindieAgent.listMemories()` currently returns the raw local RPC
  envelope rather than an SDK-shaped `{ memories, count }` payload.
- Confirmed Electron main `handleWindieSdkInvoke()` wraps handler output in
  `{ ok: true, data }`, so a raw sidecar envelope reaches renderer as nested
  command data.
- Confirmed `DesktopMemoryRuntimeClient.listMemories()` expects
  `data.memories`; this makes a real sidecar envelope render as an empty list.
- Confirmed `buildDisplayRows()` currently converts stored
  `assistant_delta` events into historical assistant message rows, while
  `toDisplayMessage()` already skips deltas. This split explains duplicate
  replay rows after reopening stored conversations.
- Confirmed Memory panel reloads on `windie:memory-store-changed` and does not
  read `chat_events`.
- Implemented SDK memory result unwrapping in `WindieAgent` public memory APIs:
  `searchMemory`, `listMemories`, `storeMemory`, `deleteMemory`, and
  `clearMemories` now return SDK-shaped data instead of raw sidecar RPC
  envelopes.
- Changed Electron main `memories.*` command handlers to verify authenticated
  state but stop passing renderer/main-selected `userId` into SDK memory API
  calls. The SDK uses the live agent user by default.
- Changed SDK historical `buildDisplayRows()` to skip `assistant_delta` and
  `reasoning_delta` while leaving those events available to `currentTurn`.
- Updated focused SDK/main tests to pin memory RPC envelope unwrapping,
  authenticated-user defaulting, main memory handler shape, and display-row
  delta filtering.
- Updated memory and SDK conversation docs plus `CHANGELOG.md`.
- Ran focused validation and SDK build.
- Final design-inspection pass found:
  - remaining `list_episodic_memories`, `list_semantic_memories`,
    `list_chat_conversations`, and `get_chat_events` strings are in Electron
    main/SDK sidecar store internals or tests, not renderer-facing memory or
    history feature APIs;
  - renderer Memory panel uses `memories.list` and reloads after
    `windie:memory-store-changed`;
  - renderer conversation/history runtime clients use `conversation.load`;
  - SDK rehydrate paths use `loadForRehydrate()` /
    `buildRehydrateSnapshot()` over conversation events;
  - renderer live assistant delta materialization is sourced from
    `windie:current-turn`.
- A fresh post-compaction inspection found `ChatGptDashboardShell` test
  scaffolding still translating SDK-shaped commands back into old
  sidecar-shaped channel names such as `get-chat-events` and
  `list-chat-conversations`. Removed that translation so the test now mocks the
  renderer contract as `windie:invoke` with SDK command names directly.
- Removed unused legacy chat-event invoke constants from the ChatInterface
  wiring test mock.
- Classified the remaining `sidecar-event` / `conversation-title-updated` path
  as a separate conversation-metadata invalidation path. It is currently mapped
  through `DesktopConversationLibraryClient.subscribeMetadataInvalidations()`
  and SDK `ConversationContinuityService`, not used as the Memory panel or
  rehydrate data source.

## Checklist

- [x] Matching report created under `docs/plans/`.
- [x] Memory command path inspected end to end.
- [x] SDK memory public APIs return renderer-facing shapes, not raw sidecar RPC
      envelopes.
- [x] Electron main `memories.*` handlers remain allowlist/runtime transport
      only.
- [x] Renderer Memory panel receives `{ memories, count }` or equivalent
      documented SDK-shaped data and renders it.
- [x] Memory panel reloads after `memory_store_changed`.
- [x] Memory panel does not read `chat_events`.
- [x] Conversation history display projection inspected end to end.
- [x] Historical `displayRows` do not render `assistant_delta` as messages.
- [x] Live assistant chunks remain visible through `currentTurn`.
- [x] Rehydrate projection inspected end to end.
- [x] Backend rehydrate uses SDK `buildRehydrateSnapshot` over canonical
      conversation events.
- [x] Rehydrate does not read memory rows or renderer transcript rows.
- [x] Store adapters remain dumb and delegate projection semantics to SDK
      projection builders.
- [x] Focused SDK tests added/updated.
- [x] Focused frontend renderer/main tests added/updated.
- [x] Focused sidecar tests added/updated if memory command sidecar shapes
      change.
- [x] Docs updated.
- [x] `CHANGELOG.md` updated.
- [x] Validation commands and results recorded in report.
- [x] Fresh final inspection finds no remaining in-scope violations.
- [ ] Commit created and recorded in report.

## Success Criteria Status

- [x] A completed turn that stores an episodic interaction memory appears in
      the Memory panel after `memory_store_changed` or panel reopen.
- [x] Renderer memory code never depends on transcript-session user id or
      sidecar JSON-RPC envelope internals.
- [x] `memories.list`, `memories.delete`, and `memories.clearAll` are
      SDK-shaped renderer commands backed by SDK public APIs.
- [x] Reopening a stored conversation displays one final assistant message, not
      one row per `assistant_delta`.
- [x] Live streaming still shows assistant text progressively through
      `currentTurn`.
- [x] Backend rehydrate remains provider-safe and uses SDK rehydrate projection,
      not visible display rows.
- [x] Memory rows and chat-event rows remain separate storage domains.
- [x] Tests fail if sidecar memory envelopes leak to renderer again.
- [x] Tests fail if historical `displayRows` render `assistant_delta` rows
      again.
- [x] Tests fail if Memory panel starts reading chat history as memory.

## Decisions And Tradeoffs

- The first implementation slice will fix the SDK-owned boundaries rather than
  adding renderer fallback parsing for sidecar envelopes.
- Electron main may still verify an authenticated current user before memory
  commands, but the renderer must not send memory user identity and the SDK
  public method should use the live agent user by default.
- `assistant_delta` remains persisted as a canonical event and remains live
  projection input. The deletion target is only historical display rows.
- Sidecar memory RPC handlers remain unchanged because this slice normalizes at
  the SDK public API boundary. Sidecar storage semantics did not change.

## Validation Log

- `./bin/docs-list`: passed.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/DesktopMemoryRuntimeClient.test.ts ../tests/frontend/MemorySection.test.jsx ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/WindieSdkClient.test.ts --watch=false`:
  failed in `WindieSdkClient.test.ts` stream-order expectations for
  `memory_diagnostic` versus `assistant_message`. This broader suite failure is
  outside this slice; the failures occur in stream facade tests not modified by
  the memory-list/projection change.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/DesktopMemoryRuntimeClient.test.ts ../tests/frontend/MemorySection.test.jsx ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/WindieSdkConversationRuntime.test.ts --watch=false`:
  passed, 4 suites / 105 tests.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/DesktopMemoryRuntimeClient.test.ts ../tests/frontend/MemorySection.test.jsx ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/ChatGptDashboardShell.test.jsx ../tests/frontend/ChatInterfaceWiring.test.jsx --watch=false`:
  passed, 6 suites / 191 tests. React printed existing `act(...)` warnings in
  `ChatGptDashboardShell`; no tests failed.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts --testNamePattern "WindieAgent exposes SDK-owned clear memory" --watch=false`:
  passed, 1 focused test.
- `cd frontend && npm run typecheck`: passed.
- `cd packages/windie-sdk-js && npm run build`: passed.
- `./bin/docs-list`: passed after the test cleanup.
- `git diff --check`: passed.
- Sidecar tests: skipped because this implementation did not change sidecar
  storage or RPC handler behavior; the fix unwraps existing sidecar envelopes at
  the SDK public API boundary.

## Final Design Inspection

- Memory panel path:
  `DesktopMemoryRuntimeClient -> windie.invoke('memories.list') -> Electron main
  allowlist -> WindieAgent.listMemories() -> sidecar memory rows`. Renderer does
  not read `chat_events` and does not parse sidecar envelopes.
- Conversation history path:
  renderer conversation clients call `conversation.load`; Electron main returns
  SDK snapshots from the live agent; store adapters delegate display rows to
  `buildDisplayRows()`.
- Rehydrate path:
  `ConversationContinuityService` and desktop continuity code load
  `rehydrate` snapshots through SDK store/projection APIs and send those
  snapshots to backend. No memory-row reads were found in the rehydrate path.
- Live stream path:
  renderer live assistant and reasoning text uses `windie:current-turn`.
  Historical `displayRows` skip `assistant_delta` and `reasoning_delta`.
- Old sidecar channel names remain only behind SDK/Electron main internals or
  tests that assert renderer-facing channels are rejected.
- Dashboard/history tests no longer translate SDK commands through legacy
  sidecar channel names.

## Commits

Pending.
