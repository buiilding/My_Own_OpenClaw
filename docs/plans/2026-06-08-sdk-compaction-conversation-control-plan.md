---
summary: "Plan for making SDK compaction lifecycle events conversation-control operations instead of active-turn stream events."
read_when:
  - When debugging missing compaction checkpoints, skipped compaction display, replay drift, or backend compaction lifecycle event filtering.
  - When changing SDK conversation runtime event acceptance, active-turn identity, compaction persistence, or compacted replay rehydrate behavior.
title: "SDK Compaction Conversation Control Plan"
---

# SDK Compaction Conversation Control Plan

## User Intent

The user wants the long-term compaction fix, not a short workaround. The
observed failure is that backend manual compaction emits normalized
`compaction_started` and `compaction_applied` events, but the SDK runtime drops
them before persistence because their `turnRef` does not match the runtime's
current `activeTurnRef`. The local sidecar DB then has no
`compaction_applied` row and no `compaction_checkpoint` row for the compaction
operation.

The desired architecture is:

```text
Backend:
  decides and produces compaction lifecycle/checkpoint payloads

SDK runtime:
  accepts, orders, reduces, installs, and persists compaction events for the
  conversation

Sidecar:
  stores SDK event/checkpoint rows without owning lifecycle policy

Renderer:
  observes SDK projections and displays status only
```

The design should match the useful lesson from OpenClaw and Codex: manual
compaction has its own operation/task identity, while the durable checkpoint is
installed at the session/conversation layer and replay resumes from that
checkpoint.

## Architectural Change

The SDK runtime must distinguish backend event scope before applying active-turn
filtering.

| Event family | Scope | Acceptance rule | State effect |
| --- | --- | --- | --- |
| assistant deltas, reasoning deltas, assistant messages, tool calls, tool progress, tool outputs, turn completion/errors | turn stream | `conversationRef` must match and `turnRef` must match `activeTurnRef` when an active turn exists | may update `activeTurnRef`, current-turn phase, stream text, tools, memory, and terminal turn state |
| `compaction_started`, `compaction_applied`, `compaction_skipped`, `compaction_failed` | conversation control | `conversationRef` must match; backend ordering/deduping still applies; active-turn equality is not required | updates compaction state and durable checkpoint data, but must not replace the active chat turn identity |

This is not a broad new architecture. It keeps the existing SDK runtime and
store ownership, but makes event scope explicit so compaction is not modeled as
part of the previous assistant turn.

## Current Findings To Reconfirm During Implementation

These are starting findings from live inspection. The implementation pass must
reread the code before editing and classify any drift.

- `ConversationRuntime.processNormalizedBackendEvent(...)` currently calls
  `shouldAcceptBackendEvent(...)` before backend sequence handling and before
  `applyEvent(...)`.
- `shouldAcceptBackendEvent(...)` currently rejects any backend event whose
  `turnRef` differs from `state.activeTurnRef` when `activeTurnRef` is set.
- `reduceConversationRuntimeState(...)` currently sets
  `activeTurnRef: event.turnRef ?? state.activeTurnRef` in the shared base state,
  so a compaction event can mutate active-turn identity if it passes the accept
  gate.
- `SidecarConversationStore` already writes `compaction_applied` payloads to
  `compaction_checkpoint`, and logs successful compaction event storage. The
  missing row is therefore likely an SDK accept/reduction issue, not a sidecar
  schema issue.
- `loadForRehydrate(...)` already prefers a complete active compacted replay
  snapshot when one exists, then falls back to events. The implementation must
  verify whether this is sufficient for newly persisted backend
  `compaction_applied` events or whether checkpoint installation requires an
  additional SDK-owned projection/store path.

## In Scope

- Add explicit SDK event-scope classification for backend-normalized events.
- Make compaction lifecycle events conversation-control events accepted by
  `conversationRef` and backend ordering/deduping, not by active chat turn.
- Preserve the backend compaction operation id without treating it as the
  active chat turn. If the existing event `turnRef` must remain for storage
  compatibility, mirror it into payload metadata such as `operationRef` or
  `compactionRef` and make the reducer ignore it for active-turn identity.
- Ensure compaction events do not mutate `state.activeTurnRef`.
- Ensure `compaction_applied` reaches `SidecarConversationStore.appendEvent(...)`
  and persists the checkpoint payload.
- Verify replay/rehydrate uses the latest complete active compaction checkpoint
  as the base history when present.
- Add low-noise diagnostics around backend event accept/reject decisions and
  compaction persistence if they remain useful after tests.
- Add focused tests for active-turn mismatch, compaction persistence, and
  replay/rehydrate checkpoint behavior.
- Update docs and `CHANGELOG.md`.

## Out Of Scope

- Rewriting backend compaction decision or summary generation.
- Changing provider history compaction strategy.
- Changing sidecar DB schema unless live inspection proves the current
  `compaction_checkpoint` field cannot store the SDK checkpoint.
- Renderer-specific compaction fallback handlers.
- Adding an Electron-only compaction persistence bridge.
- Migrating existing local DB rows. This change should affect future accepted
  compaction events; existing missing rows cannot be recovered unless the
  backend/source event is replayed.
- Broad replay redesign unrelated to complete active compacted checkpoints.

## Ordered Workflow

1. Recover and inspect current state.
   - Read this plan and the matching report.
   - Reopen `docs/sdk/conversation_runtime.md`,
     `docs/architecture/storage_persistence_change_workflow.md`, and
     `docs/reference/session_and_transcript_reference.md`.
   - Inspect recent commits touching SDK runtime, compaction normalization,
     sidecar conversation store, and rehydrate projection.
   - Check `git status --short --branch` and preserve unrelated dirty state.

2. Classify SDK event scope.
   - Inspect normalized backend event types and all current users of
     `turnRef`, `activeTurnRef`, backend sequence keys, and compaction event
     payloads.
   - Add a small SDK helper for event scope only if it removes repeated local
     checks and is used by both acceptance and reduction.

3. Fix backend event acceptance.
   - Keep strict active-turn matching for turn-stream events.
   - Allow conversation-control compaction events through when
     `conversationRef` matches.
   - Preserve backend sequence and duplicate detection for compaction events.
   - Add reject diagnostics that name the event scope and reason.

4. Fix runtime reduction.
   - Make active-turn updates explicit for turn-scoped events.
   - Ensure compaction events update only compaction state and checkpoint/debug
     data.
   - Preserve terminal turn semantics and completed-turn memory behavior.

5. Verify persistence and replay.
   - Confirm `compaction_applied` writes through `SidecarConversationStore` and
     stores a `compaction_checkpoint`.
   - Confirm complete compaction replay snapshots are persisted/loaded through
     SDK store APIs.
   - Confirm backend rehydrate prefers the compacted replay snapshot when
     present and otherwise falls back to event projection.

6. Add tests.
   - Add or update SDK runtime tests proving a compaction event with a
     mismatched operation id is accepted, persisted, and does not change
     `activeTurnRef`.
   - Add sequence/dedupe coverage for conversation-control compaction events.
   - Add store/projection coverage proving `compaction_applied` becomes a
     durable checkpoint and rehydrate can use it.
   - Add regression coverage proving stale turn-stream events are still
     rejected.

7. Update docs and changelog.
   - Update `docs/sdk/conversation_runtime.md` to document turn-stream versus
     conversation-control event scope.
   - Update any reference docs that currently describe `turnRef` as a universal
     active-turn gate.
   - Add a concise `CHANGELOG.md` entry.

8. Final design inspection.
   - Reread the touched runtime, reducer, store, projection, docs, and tests.
   - Search for remaining compaction paths that still use active-turn equality
     as a persistence gate.
   - Classify every remaining path as fixed, intentionally out of scope, or a
     blocker.
   - Record validation, inspection results, and any commit in the matching
     report.

## Success Criteria

- Backend `compaction_started`, `compaction_applied`, `compaction_skipped`, and
  `compaction_failed` events with a compaction operation id different from
  `activeTurnRef` are accepted when `conversationRef` matches.
- Stale turn-stream events with mismatched `turnRef` are still rejected.
- Compaction events do not mutate `state.activeTurnRef`.
- `compaction_applied` reaches the configured `ConversationStore`.
- Sidecar-backed storage persists the checkpoint payload in
  `compaction_checkpoint`.
- Replay/rehydrate uses a complete active compacted checkpoint as the base
  history when available.
- Renderer remains an observer of SDK compaction state and does not gain a new
  persistence path.
- No backend, Electron main, or sidecar layer gains duplicate compaction
  lifecycle ownership.
- Tests fail if compaction is routed through active-turn equality again.

## Validation Commands

Run the narrowest useful set first, then broaden if the inspection shows wider
impact:

```bash
bin/windie docs list
cd frontend && npm run test -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/WindieAgentConversationStoreApi.test.ts --watch=false
cd packages/windie-sdk-js && npm run build
git diff --check
```

Add sidecar or backend tests only if the implementation changes sidecar storage
semantics or backend event payload shape. Otherwise, record why those suites
were skipped in the report.

## Assumptions

- Backend is already emitting sequenced compaction lifecycle events for manual
  compaction.
- The compaction operation id can remain visible for diagnostics and ordering,
  but it must not be interpreted as the active chat/model turn.
- Existing local DBs do not need a schema migration because the sidecar already
  has a `compaction_checkpoint` column.
- Existing missing checkpoint rows cannot be recreated locally without replaying
  the original backend compaction event.

## Reread Anchors After Compaction

- This plan.
- `docs/plans/2026-06-08-sdk-compaction-conversation-control-report.md`.
- `docs/sdk/conversation_runtime.md`.
- `docs/reference/session_and_transcript_reference.md`.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`.
- `packages/windie-sdk-js/src/runtime/conversationReducer.ts`.
- `packages/windie-sdk-js/src/transport/backendEventNormalizer.ts`.
- `packages/windie-sdk-js/src/stores/SidecarConversationStore.ts`.
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`.
- `tests/frontend/WindieSdkConversationRuntime.test.ts`.
- `tests/frontend/WindieAgentConversationStoreApi.test.ts`.
