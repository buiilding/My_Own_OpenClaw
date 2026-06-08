---
summary: "Pre-flight plan for making WindieOS conversation display, inference preparation, compaction checkpoints, and parallel conversation runtimes follow the OpenClaw-style single-transcript architecture."
read_when:
  - When changing SDK conversation display/load/rehydrate/inference projection ownership.
  - When changing Electron main conversation runtime lifecycle, multi-conversation sends, or background chat behavior.
  - When debugging old-chat continuation, compaction replay, wrong-conversation streaming, or renderer-owned rehydrate/session state.
title: "OpenClaw-Style Conversation Runtime Plan"
---

# OpenClaw-Style Conversation Runtime Plan

Date: 2026-06-06

Status: complete.

## User Intent

Make WindieOS chat storage, chat display, chat inference, compaction, and
parallel chat execution follow the OpenClaw-style architecture:

```text
Renderer = view and user intent only
Electron main = native host and IPC only
SDK = canonical chat transcript, live turn state, compaction, inference context
Sidecar/store = persistence backend used by SDK
```

The important product behavior:

- live send immediately records the user row from SDK state;
- renderer renders SDK display rows and SDK current-turn state only;
- old chat display loads display rows, not rehydrate/model-context rows;
- continuing an old chat sends into the same `conversationRef`, and SDK/main
  prepares backend inference context internally;
- compaction is stored as durable transcript checkpoints but is not rendered as
  a normal chat bubble;
- multiple conversations can run in parallel when the user switches chats;
- switching chats is a view selection, not a runtime shutdown.

## Current Inspection Findings

The current codebase is already partway through the right migration:

- SDK `ConversationRuntime.send()` emits `turn_started` and a base
  `user_message` before resource resolution, enrichment, or backend transport.
- SDK projections already expose:
  - display rows;
  - current-turn projection;
  - rehydrate snapshot.
- Stores already expose `loadForDisplay(...)`, `loadDisplayRows(...)`, and
  `loadForRehydrate(...)`.
- Renderer chat state is mostly conversation-keyed.
- `conversation.load` is SDK-shaped and returns a runtime snapshot.
- `compaction_applied` events are normalized SDK conversation events, and
  stores can prefer a completed compacted replay snapshot for backend
  rehydrate.

The remaining architecture problems are structural:

1. Electron main still owns a single selected SDK conversation runtime.

   Current shape:

   ```text
   select conversation A runtime
   send A

   switch/send conversation B
   -> detach/close runtime A
   -> create/select runtime B
   ```

   This can orphan or lose live A events from the product point of view. It is
   not OpenClaw-style parallel session behavior.

2. Renderer still owns a backend inference-session hydration cache.

   Current shape:

   ```text
   renderer prepares send
   -> ensureConversationInferenceSessionHydrated(...)
   -> DesktopConversationContinuityService.rehydrateFromStore(...)
   -> conversation.rehydrate
   -> conversation.send
   ```

   This means old-chat continuation is still partly renderer-controlled. The
   renderer should not know whether backend inference state is hydrated.

3. `conversation.load` is overloaded.

   It returns display, display rows, rehydrate, current turn, and state in one
   snapshot. That is convenient for tests and low-level SDK customers, but it
   keeps the desktop renderer able to treat rehydrate/model-context data as a
   display path again.

4. Compaction is close but not first-class enough at the architectural API
   boundary.

   WindieOS currently stores `compaction_applied` plus compacted replay
   snapshots. The target architecture needs an explicit SDK-owned inference
   projection contract:

   ```text
   canonical transcript
   -> latest compaction checkpoint or replay summary
   -> kept recent events
   -> provider-safe inference messages
   ```

   Renderer should not trigger or inspect that projection as display behavior.

## Target Architecture

There must be one canonical SDK transcript per conversation. Everything else is
a projection:

```text
canonical transcript -> display projection
canonical transcript -> live turn projection
canonical transcript -> inference context
```

### Live Send

```text
renderer sends intent
-> Electron main gets/creates SDK runtime for conversationRef
-> SDK conversation.send()
-> SDK appends turn_started + user_message
-> SDK emits displayRows + currentTurn
-> renderer renders those projections
-> SDK prepares resources/enrichment/inference context
-> SDK sends backend query
-> SDK ingests assistant/tool/backend events
-> SDK appends final assistant/tool/terminal events
-> SDK emits refreshed displayRows + terminal currentTurn
```

### Old Chat Display

```text
renderer selects conversation
-> Electron main calls SDK display loader
-> SDK reads canonical transcript
-> SDK builds display rows
-> renderer renders display rows
```

Renderer must not load or inspect rehydrate/model-context rows for old-chat
display.

### Continuing Old Chat

```text
renderer sends into same conversationRef
-> Electron main gets/creates runtime for that conversationRef
-> SDK prepares backend inference context from canonical transcript
-> SDK sends the new turn
```

The renderer should not call `conversation.rehydrate` before send.

### Parallel Conversations

```text
send in chat A
-> runtime A continues receiving/storing A events

switch to chat B
-> renderer displays B
-> runtime A remains attached

send in chat B
-> runtime B runs independently

switch back to A
-> renderer loads A display snapshot
-> renderer also receives A currentTurn if A is still live
```

Different conversations can run concurrently. The same conversation must have a
single active turn, with deterministic queue/reject/stop behavior.

## Owning Runtime Decision

| Concern | Owner after this plan | Rule |
| --- | --- | --- |
| User intent and selected conversation | Renderer | Renderer chooses what to show and sends `conversationRef` with user intent. |
| Native IPC and runtime registry | Electron main | Main keeps a registry of SDK conversation runtimes and fans out SDK events by `conversationRef`. |
| Canonical transcript | SDK runtime over `ConversationStore` | SDK appends normalized events and derives all projections. |
| Display rows | SDK projection | Renderer asks for display rows and renders them. |
| Live turn state | SDK projection | Renderer renders current-turn presentation; it does not reduce raw backend events. |
| Inference context | SDK projection/runtime | SDK prepares provider-safe context before backend-dependent actions. |
| Persistence mechanics | Sidecar/store adapter | Store persists events/checkpoints and stays dumb. |
| Backend provider history | Backend | Backend receives SDK-prepared context/query and owns provider-facing loop state. |

## In Scope

### 1. Electron Main Runtime Registry

Replace the single selected runtime with a conversation runtime registry:

```text
Map<conversationRef, RuntimeHandle>
```

Each handle owns:

- the SDK `ConversationRuntime`;
- its event subscription detach function;
- latest snapshot/currentTurn;
- active turn/ref status;
- lifecycle metadata for terminal cleanup.

Required behavior:

- `getConversationRuntime(conversationRef)` creates or returns a runtime.
- Sending to B must not close/detach runtime A.
- `conversation.stop` targets a specific `conversationRef` and optional
  `turnRef`.
- `conversation.rehydrate` and `conversation.compact` target the conversation
  runtime without switching global lifecycle state.
- `close()` closes all runtime handles and then sleeps the agent.
- Runtime cleanup is terminal/TTL-based, not selection-based.

Deletion target:

```text
selectConversationRuntime(...) closes previous runtime
```

### 2. Conversation-Scoped Event Fanout

Every SDK runtime event fanout must include and preserve `conversationRef`.

Main should broadcast:

- `windie:conversation-event` with event conversation identity;
- `windie:rows` with row conversation identity;
- `windie:current-turn` with current-turn conversation identity;
- `windie:status` with conversation identity.

Renderer already has conversation-keyed store paths; the implementation pass
must verify all consumers store background conversation updates under the event
conversation, not the currently selected chat.

### 3. SDK-Owned Send-Time Inference Preparation

Move old-chat backend inference preparation behind SDK/main send semantics.

Target:

```text
conversation.send({ conversationRef, ... })
-> SDK/main ensures backend inference context for that conversation
-> SDK sends query
```

The renderer must stop doing:

```text
ensureConversationInferenceSessionHydrated(...)
DesktopConversationContinuityService.rehydrateFromStore(...)
```

as part of normal send preparation.

The SDK/main side should track hydration per conversation and backend
connection epoch, but that state must not be renderer UI state.

Deletion target:

```text
frontend renderer conversationInferenceSessionRuntime normal send path
```

If any explicit manual rehydrate command remains for diagnostics, it must not be
part of normal display or send flow.

### 4. Display API Separation

Split desktop-facing command semantics so feature code asks for display, not a
full low-level runtime snapshot.

Preferred API shape:

```text
conversation.loadDisplay
  -> { display, displayRows, currentTurn? }

conversation.loadInferenceContext
  -> SDK/internal or diagnostics only

conversation.load
  -> low-level SDK/test/debug snapshot only, not renderer feature path
```

Renderer dashboard/history code should call display loaders. It should not
consume `rehydrate` from `conversation.load`.

Deletion target:

```text
renderer feature code treating conversation.load as display + rehydrate bundle
```

### 5. First-Class Compaction Checkpoint Projection

Keep full transcript storage append-only:

```text
old messages
tool calls
tool outputs
compaction checkpoint #1
more messages
compaction checkpoint #2
more messages
```

SDK display projection:

- skips compaction checkpoints as chat bubbles by default;
- may expose optional checkpoint marker metadata later, but not as normal user
  or assistant text.

SDK inference projection:

```text
latest complete compaction summary/checkpoint
+ retained recent messages from latest checkpoint boundary
+ messages after latest checkpoint
```

Implementation must inspect whether current `compaction_applied` /
`CompactedReplaySnapshot` payloads already contain enough information. If not,
add the smallest SDK event payload normalization needed, such as:

```text
summary
firstKeptEntryId or equivalent retained boundary
tokensBefore or token/debug metadata when available
generationId
sourceRevisionId
entries
complete
```

Do not add a renderer compaction interpretation table.

### 6. Same-Conversation Concurrency Contract

Define and enforce one behavior for multiple sends to the same conversation
while a turn is active.

Preferred first implementation:

```text
same conversation + active non-terminal turn -> reject with clear SDK error
```

Queueing can be added later if product needs it, but silent overlapping turns
against one transcript should not be allowed.

Different conversations may run concurrently.

### 7. Tests and Boundary Guards

Add focused tests for the architecture, not just happy-path behavior:

- sending A then B does not call `runtime.close()` for A;
- backend event for A while B is selected still updates A store/projection;
- switching back to A loads A display rows and A live currentTurn if active;
- stopping B does not stop A;
- terminal cleanup does not drop completed history;
- same-conversation second send is rejected or queued deterministically;
- renderer send preparation no longer calls inference hydration;
- old chat display calls display loader only and does not request rehydrate;
- SDK store/projection skips compaction checkpoints in display;
- SDK inference projection uses latest compaction checkpoint/replay instead of
  all historical messages;
- `conversation.load` or its replacement cannot regress into renderer-side
  rehydrate display.

## Out of Scope

- Redesigning chat visuals, minimal pill layout, or response overlay placement.
- Changing provider selection/model settings behavior except where needed to
  preserve per-conversation send semantics.
- Changing backend provider compaction algorithms.
- Rewriting sidecar SQLite schema unless inspection proves the checkpoint
  fields cannot be represented in existing `event_payload` /
  `compaction_checkpoint` storage.
- Adding arbitrary compatibility shims for old renderer rehydrate paths.
- Running multiple concurrent turns in the same conversation without an
  explicit queue/reject contract.

## Implementation Workflow

1. Create the matching report file and record this plan as approved before
   editing code.
2. Re-read the current code and recent commits for:
   - `frontend/src/main/ipc.cjs`
   - `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
   - `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
   - `packages/windie-sdk-js/src/projections/conversationProjections.ts`
   - `packages/windie-sdk-js/src/stores/*ConversationStore.ts`
   - `frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime.ts`
   - renderer dashboard/history display loaders
   - existing SDK/runtime/frontend boundary tests.
3. Implement Electron main runtime registry as a narrow first slice.
4. Add runtime-registry tests proving background conversations are not closed
   on switch/send.
5. Move send-time inference preparation out of renderer and into SDK/main
   conversation send flow.
6. Delete or narrow renderer inference-session hydration code from normal send.
7. Split display loading from rehydrate/inference loading for renderer feature
   code.
8. Inspect compaction checkpoint payloads and make the SDK inference projection
   explicit enough to match the OpenClaw-style latest-checkpoint contract.
9. Add same-conversation active-turn enforcement.
10. Run focused validation after each coherent slice.
11. Reread affected paths and search for remaining in-scope violations:
    - single selected runtime lifecycle;
    - renderer normal-send rehydrate;
    - renderer display consuming rehydrate;
    - compaction interpreted outside SDK;
    - raw backend event live-row fallback.
12. Update docs and the matching report with findings, deviations, validation,
    and final inspection status.

## Success Criteria

- Electron main keeps one SDK runtime per live/loaded conversation and does not
  close a runtime because the user switches chats.
- Different conversations can continue streaming/storing independently.
- Same-conversation concurrent sends have deterministic queue/reject/stop
  behavior.
- Renderer send preparation has no normal-path inference hydration or
  `conversation.rehydrate` call.
- Renderer old-chat display consumes SDK display rows only.
- SDK owns display, current-turn, and inference projections from canonical
  transcript events.
- Compaction checkpoints are stored in the transcript but not rendered as chat
  bubbles by default.
- Inference context uses the latest complete compaction checkpoint/replay plus
  retained/new messages, not the entire historical transcript.
- Tests prove background conversation events land in their original
  conversation while another chat is selected.
- No new Electron-only bridge duplicates SDK conversation semantics.

## Validation Commands

Run the smallest focused set first, then broaden if implementation touches
shared contracts:

```bash
bin/windie docs list
npm test -- --runTestsByPath tests/frontend/IpcMainBridge.lifecycle.test.cjs
npm test -- --runTestsByPath tests/frontend/IpcMainBridge.query.test.cjs
npm test -- --runTestsByPath tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs
npm test -- --runTestsByPath tests/frontend/ConversationInferenceSessionRuntime.test.ts
npm test -- --runTestsByPath tests/frontend/DesktopConversationContinuityService.test.ts
npm test -- --runTestsByPath tests/frontend/DesktopTranscriptProjectionRuntimeClient.test.ts
npm test -- --runTestsByPath tests/frontend/WindieSdkConversationRuntime.test.ts
npm test -- --runTestsByPath tests/frontend/WindieSdkFileConversationStore.test.ts
git diff --check
```

If the runtime registry touches main-process composition heavily, add the
relevant IPC/main lifecycle tests discovered during implementation.

## Reread Anchors After Compaction

- This plan.
- The matching report file once created.
- `docs/sdk/conversation_runtime.md`
- `docs/architecture/frontend_architecture.md`
- `docs/reference/session_and_transcript_reference.md`
- `docs/architecture/storage_persistence_change_workflow.md`
- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
- `frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime.ts`

## Approval Gate

Do not implement this plan until the user approves it.
