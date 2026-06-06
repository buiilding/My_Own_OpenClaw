---
summary: "Compaction-safe migration plan for making SDK-normalized events and SDK-projected UI rows the only chat display/history source across live rendering, completion, and replay."
read_when:
  - When changing SDK display projection, live current-turn rendering, chat transcript preservation, conversation replay, or custom UI support.
  - When debugging missing, overwritten, duplicated, or reordered assistant/tool rows between live chat and historical conversation loading.
title: "SDK Display History Single Source Plan"
---

# SDK Display History Single Source Plan

## User Intent

The user wants the chat display architecture to be foundational, one-source, and
easy for external UI authors to use:

```text
SDK emits/stores normalized events.
SDK builds UI rows from those events after every event.
Renderer renders those rows.
Historical replay uses the same projection builder.
Renderer does not decide how to preserve tool rows, assistant rows, or
current-turn rows.
```

The immediate bug that exposed the unfinished architecture: three screenshot
tool interactions were expected in the chat transcript, but the visible live
tool row for the latest turn replaced or hid earlier live tool rows. The narrow
fix preserved completed current-turn rows in renderer state, but that is still a
boundary patch. The foundational fix is to remove renderer ownership of row
lifetime entirely.

## Target Architecture

Target data flow:

```text
Backend stream / local SDK events / sidecar events
  -> SDK normalization
  -> SDK append-only conversation event store
  -> SDK display projection rebuilt after every event
  -> SDK snapshot emission
  -> Electron renderer or custom UI renders snapshot.displayRows
```

Historical replay uses the same path:

```text
SDK store.loadEvents(conversationRef)
  -> SDK display projection
  -> snapshot.displayRows
  -> renderer/custom UI
```

`currentTurn` remains SDK-owned, but it is demoted to live status/control
metadata only:

- allowed: phase, busy state, active turn id, stop eligibility, overlay status,
  transient streaming text if a surface intentionally shows a live overlay
- not allowed: source of transcript rows, tool row preservation, assistant row
  preservation, historical replay, completed-turn display materialization

The invariant after migration:

```text
If a row is visible during a live turn, the same row identity and same row shape
remain visible after completion and after conversation reload, unless the SDK
event log itself is rewritten by an explicit SDK revision/compaction operation.
```

## Source Of Truth Changes

| Surface | Current issue | Target owner |
| --- | --- | --- |
| Normalized events | Already mostly SDK-owned | SDK runtime |
| Real-time event storage | Mostly SDK/store-owned, but renderer still keeps display lifetime patches | SDK `ConversationRuntime` plus SDK `ConversationStore` adapter |
| Live display rows | Still partly rebuilt from renderer `currentTurnProjection` | SDK display projection after every event |
| Completed display rows | Renderer materializes live rows on terminal events | SDK display projection already contains rows before terminal transition |
| Historical display rows | Uses SDK display rows in some loaders | Same SDK projection as live snapshots |
| `currentTurn` | Used as transcript row source in renderer paths | Status/control/overlay metadata only |
| Renderer `messages` | Stable cache plus live current-turn merge/materialization | Dumb rendered copy of SDK `displayRows`, or deleted if direct rendering is feasible |
| Electron main | Forwards SDK events and rows, still broadcasts multiple row-related channels | Thin SDK host transport for snapshots/commands |
| Preload | Narrow bridge already acceptable | Keep narrow allowlist |
| Sidecar | Storage mechanics below SDK store | Durable event storage implementation, not display interpretation |

## Superseded Work

This plan supersedes the older unapproved plan:

- `docs/plans/2026-06-06-sdk-ui-runtime-contract-plan.md`

It also continues the already completed display-row refactor rather than
pretending that work failed. The previous refactor added SDK `displayRows` and
store loaders, but live dashboard rendering still has escape paths:

- `ChatInterface` still builds `currentTurnMessages` from `currentTurnProjection`.
- `buildThreadPresentationMessages(...)` still accepts `currentTurnMessages`.
- Terminal handlers still call
  `upsertMaterializedCurrentTurnProjectionMessages(...)`.
- `buildCurrentTurnMessagesFromProjection(...)` still creates message rows from
  `currentTurnProjection`.
- `currentTurnProjection` still participates in transcript rendering instead of
  only status/overlay behavior.

Those are the in-scope buggy implementations to delete or demote.

## In Scope

- Make the SDK conversation runtime emit a complete display snapshot after every
  normalized event that can affect UI rows.
- Make the SDK event store the only real-time persistence source for live and
  historical display projection.
- Ensure `snapshot.displayRows` is the one row source for live dashboard chat,
  completed turns, conversation reload, dashboard conversation opening, and
  custom UI examples.
- Update Electron main to forward SDK snapshot/display state without adding
  Electron-only display semantics.
- Update renderer chat state so it renders SDK rows and no longer decides how to
  preserve active assistant/tool/current-turn rows.
- Delete terminal row-materialization helpers once SDK display snapshots are the
  live source.
- Delete or demote current-turn-to-message helpers from dashboard transcript
  rendering.
- Keep response overlay/minimal chat pill behavior working, but classify any
  remaining use of `currentTurn` as overlay/status-only.
- Update docs and tests so future changes cannot reintroduce renderer transcript
  ownership.

## Out Of Scope

- Visual redesign of chat, overlay, or dashboard.
- Backend prompt/provider policy changes.
- Model-facing tool schema changes.
- Sidecar SQLite schema migration unless implementation discovers normalized
  events are not currently persisted early enough for the invariant.
- Public SDK package publishing or version bumping.
- Removing all raw backend debug channels if they are still needed for
  diagnostics and do not feed transcript rows.
- Rewriting response overlay UI if it can remain a status/progressive-text
  surface over SDK metadata.

## Design Rules

- SDK event append happens before or together with snapshot emission. The
  renderer must never be the only place where a visible row exists.
- Display rows are projected from normalized events, not from React component
  state.
- Display row ids come from SDK event identity and are stable across live and
  replay.
- A tool call row and a tool output row are independent SDK rows. The renderer
  does not pair, merge, dedupe, or preserve them.
- Terminal events update phase/status. They do not trigger renderer transcript
  reconstruction.
- Renderer adapters may map one SDK row to one visual `ChatMessage` while the
  existing component tree is being preserved. That adapter must be a field
  mapper, not a reducer, splice engine, deduper, or row-lifetime owner.
- `currentTurnProjection` may remain in renderer store only for status/control
  surfaces. If a renderer path uses it to produce transcript rows, that path is
  in scope for deletion.

## Ordered Workflow

1. Create the matching execution report under `docs/plans/` after approval.
2. Reread these anchors after any context compaction:
   `docs/sdk/conversation_runtime.md`,
   `docs/refactors/sdk_display_rows_refactor_plan.md`,
   `docs/refactors/sdk_display_rows_refactor_report.md`,
   `docs/architecture/frontend_architecture.md`,
   `docs/architecture/runtime_boundary_matrix.md`,
   `docs/architecture/data_flow_and_state_ownership.md`,
   `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`,
   `packages/windie-sdk-js/src/projections/conversationProjections.ts`,
   `frontend/src/main/ipc.cjs`,
   `frontend/src/renderer/features/chat/components/ChatInterface.jsx`,
   `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`,
   `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js`,
   `frontend/src/renderer/features/chat/utils/state/chatBoxResponseState.js`,
   `frontend/src/renderer/features/chat/utils/chatStream/currentTurnMessageMaterialization.ts`,
   `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`,
   and `examples/custom-ui`.
3. Inspect recent related commits for touched files and symbols, especially the
   screenshot-row preservation commit and the earlier SDK display-row refactor.
4. Inventory live row sources with targeted searches:
   `buildThreadPresentationMessages`, `buildCurrentTurnMessagesFromProjection`,
   `currentTurnMessages`, `upsertMaterializedCurrentTurnProjectionMessages`,
   `setCurrentTurnProjection`, `displayRows`, `loadDisplayRows`,
   `windie:rows`, `windie:conversation-event`, and
   `conversation-runtime-updated`.
5. Classify each path:
   SDK event source, SDK display projection, SDK status projection,
   Electron transport, renderer visual adapter, renderer local UI state,
   storage implementation, diagnostic-only path, or deletion candidate.
6. Design the live snapshot contract:
   the SDK runtime must expose the latest `displayRows` after every event, and
   Electron/custom clients must receive that update without separately
   listening to current-turn transcript rows.
7. Implement the SDK slice first:
   ensure runtime event application, store append, and display projection are
   serialized enough that snapshots cannot skip visible tool rows.
8. Implement the Electron main/preload slice:
   preserve the narrow bridge and forward SDK display snapshots; do not add a
   new Electron-owned row protocol unless a real security/lifecycle boundary
   requires it.
9. Implement the renderer slice:
   render SDK display rows for live and loaded chat, keep only local UI state in
   React/Zustand, and remove current-turn transcript merging/materialization.
10. Implement the replay/dashboard/custom UI slice:
    verify conversation open, local snapshot loading, dashboard conversation
    list previews, and `examples/custom-ui` use the same SDK projection.
11. Delete obsolete code after callers move:
    remove or demote `currentTurnMessageMaterialization`,
    `buildCurrentTurnMessagesFromProjection` transcript usage,
    `currentTurnMessages` support in `buildThreadPresentationMessages`, and
    terminal-handler row materialization.
12. Add tests at the SDK boundary first, then renderer boundary tests that fail
    if renderer reconstructs transcript rows from `currentTurnProjection`.
13. Run validation, update the report, reread affected live code, run the
    inventory searches again, classify remaining findings, and repeat until no
    in-scope live/replay row ownership remains in renderer.

## Checklist

- [ ] User approved this plan before implementation.
- [ ] Matching execution report created and kept current.
- [ ] Recent commits inspected and summarized in the report.
- [ ] Live row-source inventory recorded in the report.
- [ ] SDK emits/provides display snapshots after every display-affecting
      normalized event.
- [ ] Real-time store append/projection ordering is explicit and tested.
- [ ] Renderer dashboard renders SDK `displayRows` as its live transcript.
- [ ] Historical conversation loading uses the same SDK display projection.
- [ ] `currentTurnProjection` is status/control/overlay-only in renderer.
- [ ] Terminal completion/error handlers no longer materialize transcript rows
      from `currentTurnProjection`.
- [ ] `buildThreadPresentationMessages(...)` no longer accepts or merges
      `currentTurnMessages`.
- [ ] `buildCurrentTurnMessagesFromProjection(...)` is deleted or restricted to
      non-transcript overlay code with a documented reason.
- [ ] `upsertMaterializedCurrentTurnProjectionMessages(...)` is deleted.
- [ ] `examples/custom-ui` demonstrates rendering SDK display snapshots.
- [ ] Docs updated to describe the new one-source row invariant.
- [ ] Tests prove repeated screenshot/tool rows survive live, completion, and
      reload without renderer preservation logic.
- [ ] Design-inspection loop completed and recorded in the report.
- [ ] Validation commands recorded in the report.

## Success Criteria

- The renderer can be described truthfully as: it receives SDK display rows and
  renders them.
- Live dashboard chat, completed chat, and loaded historical chat use the same
  SDK display projection.
- A row visible during a live turn has stable identity and shape after
  completion and reload.
- Repeated screenshot/tool calls produce independent tool-call/tool-output rows
  without renderer materialization or current-turn preservation logic.
- Renderer code does not synthesize, splice, dedupe, or preserve transcript rows
  from `currentTurnProjection`.
- `currentTurnProjection` remains useful for phase/status/overlay behavior but
  is not a transcript source.
- Electron main/preload remain thin transport/host layers and do not own row
  semantics.
- Sidecar remains storage mechanics below the SDK store interface and does not
  own display interpretation.
- Custom UI examples can render the same SDK display snapshots without copying
  desktop renderer helpers.
- No storage migration is needed, or the report explicitly explains the
  migration and compatibility behavior.

## Validation Commands

Run the focused validation set during implementation and record exact results in
the matching report:

```bash
bin/windie docs list

cd frontend && npm test -- --runInBand \
  ../tests/frontend/WindieSdkConversationRuntime.test.ts \
  ../tests/frontend/SdkDisplayChatMessageProjection.test.ts \
  ../tests/frontend/ConversationContinuityService.test.ts \
  ../tests/frontend/DesktopConversationContinuityService.test.ts \
  ../tests/frontend/DesktopConversationLibraryClient.test.ts \
  ../tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx \
  ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx \
  ../tests/frontend/ChatInterfaceWiring.test.jsx \
  ../tests/frontend/ChatBoxResponse.state.test.jsx \
  ../tests/frontend/MessagePresentationPipeline.test.js \
  ../tests/frontend/RendererChatRuntimeBoundary.test.ts

cd frontend && npm run typecheck
cd packages/windie-sdk-js && npm run build
node examples/custom-ui/run.mjs --smoke
git diff --check
```

If a listed command is not valid in the current checkout, replace it with the
nearest focused equivalent and document the reason in the report.

## Search Proof Required Before Completion

Before marking the report complete, run and record searches proving no
in-scope renderer transcript path remains:

```bash
rg -n "upsertMaterializedCurrentTurnProjectionMessages|currentTurnMessages|buildThreadPresentationMessages\\(|buildCurrentTurnMessagesFromProjection" \
  frontend/src tests/frontend

rg -n "currentTurnProjection" \
  frontend/src/renderer/features/chat frontend/src/renderer/features/minimalChatPill tests/frontend
```

Remaining `currentTurnProjection` hits must be classified as status/control,
overlay-only, tests for status/control, or out of scope. Any remaining hit that
creates transcript rows is not acceptable.

## Approval Gate

Do not implement this plan until the user approves it. After approval, create
the matching report and execute the workflow until the design-inspection loop
finds no remaining in-scope row-source violations.
