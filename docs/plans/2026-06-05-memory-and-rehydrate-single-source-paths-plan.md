---
summary: "Plan for making Memory panel, conversation history display, backend rehydrate, and live streaming use one canonical source and one path each."
read_when:
  - When debugging Memory panel counts, completed-turn memory display, stored chat replay, assistant delta duplication, or backend rehydrate drift.
  - When changing SDK memory APIs, SDK display projections, conversation rehydrate, or renderer transcript/runtime ownership.
title: "Memory And Rehydrate Single Source Paths Plan"
---

# Memory And Rehydrate Single Source Paths Plan

## User Intent

The user wants a clean, foundational implementation where Memory panel,
conversation history display, backend rehydrate, and live streaming each have
one source of truth and one runtime path.

The concrete symptoms motivating this plan are:

- A completed turn persisted an episodic interaction memory in the local
  sidecar memory store, but the Memory panel still rendered `Episodic 0`.
- Reopening or rehydrating a conversation rendered every stored
  `assistant_delta` chunk as its own historical assistant row, then rendered the
  final assistant message again.
- Prior cleanup removed renderer-provided memory `userId`, but did not fully
  prove the SDK/main/renderer memory payload contract end to end.

The goal is not a compatibility patch. The goal is to make each topic use one
canonical owner:

```text
Memory display:
  renderer -> windie.invoke('memories.list') -> Electron main -> SDK memory API
  -> sidecar memory rows

Conversation history display:
  renderer -> windie.invoke('conversation.load') -> Electron main
  -> SDK display projection -> chat_events

Backend rehydrate:
  runtime/continuity -> SDK rehydrate projection -> backend rehydrate command

Live streaming:
  SDK currentTurn projection -> renderer display
```

## Architectural Change

The implementation must enforce these boundaries:

| Topic | Source of truth | Renderer role | Electron main role | SDK role | Sidecar role |
| --- | --- | --- | --- | --- | --- |
| Memory panel | Memory rows in sidecar episodic/semantic stores through SDK memory APIs | Invoke `memories.*`, render returned rows, reload on invalidation | Strict command allowlist and authenticated runtime access | Own memory command semantics and unwrap/normalize local RPC results | Store/query/delete memory rows and indexes |
| Conversation history display | `chat_events` loaded through SDK `ConversationStore` projections | Invoke `conversation.load`, render `displayRows` | Strict command allowlist and live agent access | Own `buildDisplayRows` and display row semantics | Store canonical event rows only |
| Backend rehydrate | SDK `buildRehydrateSnapshot` over canonical conversation events | No provider-history shaping | Transport call only | Own provider-safe rehydrate projection | Store/load events |
| Live turn display | SDK `currentTurn` snapshot | Render live assistant/tool/phase state | Broadcast current-turn snapshot | Accumulate deltas/tools/phase | No live UI ownership |

Important rules:

- Memory panel must never read `chat_events`.
- Rehydrate must never read memory rows.
- Historical transcript display must not render `assistant_delta` rows.
- Live UI may render streamed assistant text only through SDK `currentTurn`.
- `memory_store_changed` is an invalidation event only. Renderer must reload
  through `memories.list`; it must not mutate memory rows from event payloads.
- Sidecar JSON-RPC success envelopes must not leak to renderer-facing
  SDK-shaped commands.

## Current Findings To Reconfirm During Implementation

The next implementation pass must inspect live code again before editing. These
findings were observed before this plan was written and must be treated as
starting hypotheses, not as stale guaranteed truth:

- `WindieAgent.listMemories()` appears to return the raw local-runtime RPC
  envelope, shaped like `{ success: true, data: { memories, count } }`.
- `handleWindieSdkInvoke()` wraps handler results again as
  `{ ok: true, data }`.
- `DesktopMemoryRuntimeClient.listMemories()` appears to read
  `data.memories`, so an envelope-shaped result can become an empty list.
- `buildDisplayRows()` appears to convert `assistant_delta` events into
  historical assistant message rows.
- `toDisplayMessage()` already appears to skip `assistant_delta`, so there may
  be inconsistent display paths inside SDK projections.

Implementation must reread these paths, classify them, and fix the actual live
code rather than assuming the above remains exact.

## Out Of Scope

- Redesigning Memory panel visuals.
- Changing semantic summarization policy or idle summarizer thresholds.
- Changing backend provider history semantics except through the SDK rehydrate
  projection contract.
- Changing completed-turn memory creation policy beyond returning/listing the
  stored result correctly.
- Migrating or deleting existing user databases.
- Reintroducing renderer direct sidecar IPC channels.
- Adding compatibility shims for old renderer memory/chat paths.
- Making rehydrate create new memories from old chat history.

## Conceptual Code

These snippets define the intended shape. The implementation must follow actual
repo patterns and update tests/docs accordingly.

### Memory List Path

Renderer expresses display intent only:

```ts
const result = await windie.invoke('memories.list', {
  type: 'episodic',
  limit: 200,
});

renderMemoryItems(result.memories);
```

Electron main stays transport/allowlist only:

```js
const sdkCommandHandlers = {
  async 'memories.list'(payload = {}) {
    const agent = await ensureWindieAgent({
      reason: 'sdk-command:memories.list',
    });

    return agent.listMemories({
      type: normalizeMemoryType(payload.type),
      limit: normalizePositiveInteger(payload.limit),
    });
  },
};
```

SDK owns unwrapping and public shape:

```ts
async listMemories(input: { type: 'episodic' | 'semantic'; limit?: number }) {
  const result = await this.localRuntime.rpc({
    method: input.type === 'semantic'
      ? 'list_semantic_memories'
      : 'list_episodic_memories',
    params: {
      user_id: this.userId,
      limit: input.limit,
    },
  });

  const data = unwrapLocalRpcData(result);
  return {
    memories: Array.isArray(data.memories) ? data.memories : [],
    count: Number.isFinite(data.count) ? data.count : data.memories?.length ?? 0,
  };
}
```

Memory invalidation remains reload-only:

```ts
window.ipc.on('windie:memory-store-changed', () => {
  void loadMemories();
});
```

### History Display Path

SDK display projection excludes live-only deltas:

```ts
function displayRowFromEvent(event: ConversationEvent): SdkDisplayRow | null {
  if (event.type === 'assistant_delta' || event.type === 'reasoning_delta') {
    return null;
  }

  if (event.type === 'assistant_message') {
    return assistantDisplayRow(event);
  }

  if (event.type === 'user_message') {
    return userDisplayRow(event);
  }

  if (isToolDisplayEvent(event)) {
    return toolDisplayRow(event);
  }

  return null;
}
```

Store adapters stay dumb:

```ts
async loadDisplayRows(conversationRef: string) {
  return buildDisplayRows(await this.loadEvents(conversationRef));
}
```

Renderer renders SDK rows, not raw event interpretation:

```ts
const snapshot = await windie.invoke('conversation.load', { conversationRef });
setMessages(mapSdkDisplayRowsToChatMessages(snapshot.displayRows));
```

### Backend Rehydrate Path

SDK builds provider-safe history from events:

```ts
async function rehydrateFromStore(conversationRef: string) {
  const events = await store.loadEvents(conversationRef);
  const rehydrate = buildRehydrateSnapshot(events);

  await backendTransport.rehydrateConversation({
    ...rehydrate,
    rehydrate_mode: 'replace',
  });
}
```

`buildRehydrateSnapshot()` must not depend on Memory panel rows or renderer
transcript rows.

### Live Turn Path

Live assistant deltas belong only in `currentTurn`:

```ts
runtime.subscribeEvents((event, snapshot) => {
  broadcastToRenderers('windie:rows', snapshot.displayRows);
  broadcastToRenderers('windie:current-turn', snapshot.currentTurn);
});
```

Renderer live surfaces render:

```ts
const currentTurnMessages = buildCurrentTurnMessagesFromProjection(currentTurn);
```

## Ordered Inspection And Implementation Workflow

This is an inspection loop, not a fixed one-shot edit list. Keep going until a
fresh inspection finds no remaining in-scope violations.

1. Recover context by reading this plan, the matching report, and current
   `git status`.
2. Inspect current memory command path from renderer to main to SDK to sidecar:
   `DesktopMemoryRuntimeClient`, `windieCommandInvokeClient`, main
   `memories.*` command handlers, `WindieAgent.listMemories/deleteMemory/
   clearMemories`, local-runtime RPC unwrap helpers, and sidecar
   `list_episodic_memories/list_semantic_memories`.
3. Classify every memory-list payload boundary as one of:
   - canonical SDK public shape,
   - internal sidecar envelope,
   - renderer-only view model.
4. Change the earliest SDK-owned boundary that leaks sidecar envelope shape so
   renderer receives one stable public memory shape.
5. Inspect Memory panel refresh behavior after `memory_store_changed` and prove
   it reloads through `memories.list` rather than manually mutating state from
   event payloads.
6. Inspect conversation display projection paths:
   `buildDisplayRows`, `buildDisplayConversation`, store
   `loadForDisplay/loadDisplayRows`, renderer load/display adapters, and tests.
7. Remove historical display rendering for `assistant_delta` and other
   live-only chunks. Keep live deltas in `currentTurn` only.
8. Inspect rehydrate projection paths:
   `buildRehydrateSnapshot`, `ConversationContinuityService`,
   desktop continuity services, and backend transport rehydrate calls.
9. Prove backend rehydrate consumes only SDK rehydrate projection over
   `chat_events`, not renderer rows and not memory rows.
10. Inspect renderer for remaining direct raw-event or sidecar-shaped history
    interpretation that duplicates SDK display/rehydrate/current-turn
    ownership. Delete or route through SDK-shaped commands where in scope.
11. Update focused SDK/frontend/sidecar tests to pin the public shapes and the
    separation of memory/history/live paths.
12. Update docs and `CHANGELOG.md`.
13. Run validation commands and record results in the matching report.
14. Perform a final design-inspection pass:
    - Re-search memory paths for leaked sidecar envelopes.
    - Re-search display paths for `assistant_delta` historical rows.
    - Re-search rehydrate paths for renderer-shaped provider history.
    - Re-search Memory panel for chat-event reads.
    - Re-search rehydrate/history for memory-row reads.
15. If any in-scope violation remains, implement the next slice and repeat from
    the inspection step. Stop only when every finding is fixed or explicitly
    blocked in the report with evidence.

## Checklist

- [ ] Matching report created under `docs/plans/`.
- [ ] Memory command path inspected end to end.
- [ ] SDK memory public APIs return renderer-facing shapes, not raw sidecar RPC
      envelopes.
- [ ] Electron main `memories.*` handlers remain allowlist/runtime transport
      only.
- [ ] Renderer Memory panel receives `{ memories, count }` or equivalent
      documented SDK-shaped data and renders it.
- [ ] Memory panel reloads after `memory_store_changed`.
- [ ] Memory panel does not read `chat_events`.
- [ ] Conversation history display projection inspected end to end.
- [ ] Historical `displayRows` do not render `assistant_delta` as messages.
- [ ] Live assistant chunks remain visible through `currentTurn`.
- [ ] Rehydrate projection inspected end to end.
- [ ] Backend rehydrate uses SDK `buildRehydrateSnapshot` over canonical
      conversation events.
- [ ] Rehydrate does not read memory rows or renderer transcript rows.
- [ ] Store adapters remain dumb and delegate projection semantics to SDK
      projection builders.
- [ ] Focused SDK tests added/updated.
- [ ] Focused frontend renderer/main tests added/updated.
- [ ] Focused sidecar tests added/updated if memory command sidecar shapes
      change.
- [ ] Docs updated.
- [ ] `CHANGELOG.md` updated.
- [ ] Validation commands and results recorded in report.
- [ ] Fresh final inspection finds no remaining in-scope violations.
- [ ] Commit created and recorded in report.

## Success Criteria

- A completed turn that stores an episodic interaction memory appears in the
  Memory panel after `memory_store_changed` or panel reopen.
- Renderer memory code never depends on transcript-session user id or sidecar
  JSON-RPC envelope internals.
- `memories.list`, `memories.delete`, and `memories.clearAll` are SDK-shaped
  renderer commands backed by SDK public APIs.
- Reopening a stored conversation displays one final assistant message, not one
  row per `assistant_delta`.
- Live streaming still shows assistant text progressively through
  `currentTurn`.
- Backend rehydrate remains provider-safe and uses SDK rehydrate projection,
  not visible display rows.
- Memory rows and chat-event rows remain separate storage domains.
- Tests fail if sidecar memory envelopes leak to renderer again.
- Tests fail if historical `displayRows` render `assistant_delta` rows again.
- Tests fail if Memory panel starts reading chat history as memory.

## Validation Commands

Planned validation:

```bash
./bin/docs-list
cd frontend && npm run test -- --runTestsByPath \
  ../tests/frontend/DesktopMemoryRuntimeClient.test.ts \
  ../tests/frontend/MemorySection.test.jsx \
  ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs \
  ../tests/frontend/ConversationContinuityService.test.ts \
  ../tests/frontend/ConversationInferenceSessionRuntime.test.ts \
  ../tests/frontend/WindieSdkConversationRuntime.test.ts
cd frontend && npm run typecheck
cd packages/windie-sdk-js && npm run build
./scripts/test-sidecar tests/sidecar/test_local_backend.py tests/sidecar/test_local_store_delete_cleanup.py
git diff --check
```

If the implementation only changes SDK/frontend projection and no sidecar
storage semantics, sidecar tests may be recorded as skipped with the reason. If
sidecar payloads or local memory RPC behavior change, run the focused sidecar
tests.

## Reread Anchors After Compaction

When resuming after context compaction, read these first before coding:

- This plan.
- The matching report:
  `docs/plans/2026-06-05-memory-and-rehydrate-single-source-paths-report.md`
- `docs/sdk/conversation_runtime.md`
- `docs/architecture/memory_system.md`
- `docs/architecture/storage_persistence_change_workflow.md`
- Current `git status --short --branch`

Then inspect the live code paths rather than relying on previous chat history:

- `frontend/src/renderer/app/runtime/desktopMemoryRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/windieCommandInvokeClient.ts`
- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts`
- `packages/windie-sdk-js/src/stores/SidecarConversationStore.ts`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/memory/local_store.py`
- Relevant tests under `tests/frontend`, `tests/sdk`, and `tests/sidecar`

## Assumptions

- The existing SDK runtime remains the intended owner of memory persistence,
  conversation display projection, current-turn projection, and backend
  rehydrate projection.
- Electron main should continue using SDK public APIs and strict command
  allowlists rather than exposing sidecar internals to renderer.
- A memory row is not the visible chat log. A chat event is not a durable memory
  row.
- Rehydrate should restore backend/provider context, not create or infer new
  memory rows.
- Existing local DB rows may remain in place; this plan changes runtime paths
  and projections, not user-data migration.
