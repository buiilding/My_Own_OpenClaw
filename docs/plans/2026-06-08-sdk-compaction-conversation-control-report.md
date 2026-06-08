---
summary: "Realtime implementation report for the SDK compaction conversation-control plan."
read_when:
  - When continuing or reviewing SDK compaction event acceptance, checkpoint persistence, or replay/rehydrate behavior.
title: "SDK Compaction Conversation Control Report"
---

# SDK Compaction Conversation Control Report

Plan: [SDK Compaction Conversation Control Plan](2026-06-08-sdk-compaction-conversation-control-plan.md)

## Status

Complete. Implementation, follow-up manual-compaction busy-state validation,
and final design inspection are done.

## User Intent

Implement the long-term compaction boundary: backend compaction lifecycle events
are conversation-control operations accepted and persisted by the SDK runtime,
not active-turn stream events filtered by the current chat turn id.

## Inspection Log

- Ran `bin/windie docs list`; canonical navigation validated.
- Read `docs/docs.json` and `docs/getting-started/docs_directory.md`.
- Read `docs/sdk/conversation_runtime.md`,
  `docs/architecture/storage_persistence_change_workflow.md`, and
  `docs/reference/session_and_transcript_reference.md`.
- Checked `git status --short --branch`: branch is `main...origin/main` and
  ahead by 4 commits before this plan/report.
- Inspected recent commits touching SDK runtime, display projection,
  compaction logging, and replay/memory ownership:
  `e1ce59d22`, `061aabff6`, and `36dc1115e`.
- Prior live inspection established that the local sidecar DB had no row for
  compaction turn `22097284-d65b-4808-8bdc-816d323e10e5`, and no new
  `compaction_applied` / `compaction_checkpoint` row after the backend emitted
  normalized compaction events.
- Prior OpenClaw/Codex comparison established the intended shape: compaction has
  its own operation/task identity, while durable checkpoint installation belongs
  to the session/conversation runtime.
- User approved the plan.
- Reread the live SDK runtime, reducer, backend normalizer, sidecar store,
  in-memory/file store replay behavior, SDK conversation docs, session
  identifier reference, and focused tests.
- Confirmed `ConversationRuntime.processNormalizedBackendEvent(...)` still
  filtered backend events before sequence handling and persistence.
- Confirmed `reduceConversationRuntimeState(...)` still updated
  `activeTurnRef` from the shared base for any event with `turnRef`.
- Confirmed `SidecarConversationStore` already writes `compaction_applied`
  payloads into `compaction_checkpoint`.
- Confirmed `SidecarConversationStore` could derive compacted replay from
  persisted `compaction_applied` events, but `InMemoryConversationStore` and
  `FileConversationStore` only used explicit `replaceCompactedReplay(...)`
  snapshots.
- Confirmed backend-normalized `compaction_applied` payloads carried
  `replacementHistoryEntries` but not the canonical replay fields expected by
  store replay loading.
- Implemented `conversationEventScope` to classify `compaction_*` events and
  compaction-derived `runtime_error` events as conversation-control events.
- Updated `ConversationRuntime` so conversation-control compaction events bypass
  active-turn equality while retaining conversation matching, backend sequence
  ordering, duplicate event-id suppression, and focused rejected-compaction
  diagnostics.
- Updated the reducer so only turn-stream events update `state.activeTurnRef`.
- Updated backend compaction normalization to preserve the operation id in
  `operationRef` / `compactionRef` and expose replay fields:
  `entries`, `entryCount`, `complete`, `active`, `sourceRevisionId`,
  `sourceTurnRef`, and `createdAt`.
- Added a shared compacted-replay event helper and used it from sidecar,
  in-memory, and file store adapters so a persisted `compaction_applied` event
  can become the active rehydrate base.
- Updated renderer SDK compaction observers so SDK-normalized `compaction_*`
  events are observed by conversation, not stale-gated by the compaction
  operation id. Raw backend stale compaction handling remains separate
  display/tracking behavior.
- Added focused regressions proving manual compaction operation ids different
  from `activeTurnRef` are accepted, persisted, deduped, and used for rehydrate
  while stale turn-stream backend events are still rejected.
- Updated `docs/sdk/conversation_runtime.md`,
  `docs/reference/session_and_transcript_reference.md`, and `CHANGELOG.md`.
- Follow-up inspection after manual compaction reproduced a UI busy-state
  symptom: `compaction_started` could move a completed turn into `compacting`,
  `compaction_applied` could then move it to `streaming`, and current-turn
  projections could treat the compaction operation `turnRef` as a new live turn
  anchor.
- Updated the reducer so `compaction_started`, `compaction_applied`, and
  `compaction_failed` preserve the existing turn phase. Manual compaction after
  a completed turn now stays completed/non-busy; in-loop compaction preserves
  the already-active turn-stream phase without extending it.
- Updated current-turn projections so `compaction_*` and raw
  `context-compaction-*` lifecycle events do not reset the current turn to the
  compaction operation id and do not turn compaction failure into a live turn
  error.
- Added a regression proving completed-turn manual compaction keeps
  `presentation.isBusy: false` and leaves the current turn anchored to the
  assistant turn, not the compaction operation.
- Final design inspection found:
  - SDK backend acceptance now gates turn-stream events by active turn while
    accepting compaction conversation-control events by conversation and
    backend sequence.
  - Reducer active-turn updates now go through event-scope classification, so
    compaction operation ids do not replace chat turn identity.
  - Store replay derivation is shared across sidecar, in-memory, and file
    stores; persisted `compaction_applied` events with replay entries can be
    used as the rehydrate base.
  - Renderer SDK compaction observers no longer stale-gate normalized
    compaction events by operation id. Raw backend stale-compaction display
    guards remain separate and out of the durable checkpoint path.
  - Remaining active-turn equality checks are for turn-stream/display/tracking
    paths, not SDK compaction checkpoint persistence.
  - Remaining current-turn phase/projection paths ignore compaction lifecycle
    events as live-loop drivers while still allowing compaction status/checkpoint
    projection.

## Checklist

- [x] Plan file created under `docs/plans/`.
- [x] Matching report file created under `docs/plans/`.
- [x] Plan approved by user.
- [x] Current runtime/store/projection code reread after approval.
- [x] Event-scope classification implemented.
- [x] Backend event accept gate updated.
- [x] Runtime reducer updated so compaction does not mutate active turn.
- [x] Runtime reducer updated so compaction does not mutate active turn phase.
- [x] Current-turn projections updated so compaction operation ids do not become
      live-turn anchors.
- [x] Compaction checkpoint persistence verified through SDK store.
- [x] Replay/rehydrate checkpoint behavior verified.
- [x] Focused tests added/updated.
- [x] Docs updated.
- [x] `CHANGELOG.md` updated.
- [x] Validation commands recorded.
- [x] Fresh final design inspection recorded.
- [ ] Commit created and recorded, unless user asks not to commit.

## Success Criteria Status

- [x] Compaction events with operation ids different from `activeTurnRef` are
      accepted when `conversationRef` matches.
- [x] Stale turn-stream events with mismatched `turnRef` are still rejected.
- [x] Compaction events do not mutate `state.activeTurnRef`.
- [x] Compaction events do not mutate `state.phase` or current-turn busy state.
- [x] `compaction_applied` reaches the configured `ConversationStore`.
- [x] Sidecar-backed storage persists `compaction_checkpoint`.
- [x] Replay/rehydrate uses a complete active compacted checkpoint when present.
- [x] Renderer remains display-only for compaction state.
- [x] No duplicate compaction lifecycle owner is introduced.

## Decisions And Tradeoffs

- The approved design should preserve the existing SDK runtime as the owner
  rather than adding backend retries, renderer fallbacks, or Electron-only
  bridges.
- The implementation should classify event scope explicitly instead of adding a
  one-off `if compaction then bypass activeTurnRef` check at the reject site.
- Existing DB schema is expected to need no migration because
  `chat_events.compaction_checkpoint` already exists. This must be reconfirmed
  during implementation.
- Renderer SDK compaction observers were included because the same operation-id
  misunderstanding existed in display handling. The renderer still does not own
  durable checkpoint policy; it only observes SDK-normalized compaction state
  and may ask the SDK continuity service to persist the same replay snapshot.

## Validation Log

- `bin/windie docs list`: passed during plan creation.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts --watch=false`:
  passed, 1 suite / 103 tests.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/WindieAgentConversationStoreApi.test.ts --watch=false`:
  passed, 2 suites / 107 tests.
- `cd packages/windie-sdk-js && npm run build`: passed.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts --watch=false`:
  passed after manual-compaction busy-state regression, 1 suite / 104 tests.
- `cd packages/windie-sdk-js && npm run build`: passed after
  manual-compaction busy-state reducer/projection updates.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/ChatStreamCompactionHandlers.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts --watch=false`:
  passed after manual-compaction busy-state update, 2 suites / 108 tests.
- `cd frontend && npm run typecheck`: passed after manual-compaction
  busy-state update.
- `bin/windie docs list`: passed after manual-compaction busy-state docs/report
  updates.
- `git diff --check`: passed after manual-compaction busy-state docs/report
  updates.
- `bin/windie docs list`: passed after docs updates.
- `git diff --check`: passed.
- `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/ChatStreamCompactionHandlers.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/WindieAgentConversationStoreApi.test.ts --watch=false`:
  passed, 3 suites / 111 tests.
- `cd frontend && npm run typecheck`: passed.
- `bin/windie docs list`: passed after final report update.
- `git diff --check`: passed after final report update.
- Backend tests: skipped because backend compaction payload shape and decision
  logic did not change.
- Sidecar tests: skipped because sidecar schema/RPC behavior did not change;
  SDK store tests cover event payload write and replay derivation.

## Blockers

- None.
