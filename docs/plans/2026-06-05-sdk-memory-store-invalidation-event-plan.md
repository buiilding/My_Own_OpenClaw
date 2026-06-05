---
summary: "Plan for adding an SDK-owned memory-store invalidation event so Electron renderer memory surfaces refresh after SDK memory changes."
read_when:
  - When changing completed-turn memory persistence, Memory panel refresh behavior, SDK conversation events, or Electron renderer memory-list invalidation.
title: "SDK Memory Store Invalidation Event Plan"
---

# SDK Memory Store Invalidation Event Plan

## User Intent

The user cleared local memory, sent a new message, and saw the Memory panel
still show `Episodic 0`. Direct SQLite inspection showed the SDK completed-turn
memory persistence path did create one `memories` row with
`record_kind='interaction'` for the authenticated user. The issue is not memory
creation. The issue is that the Memory panel does not refresh when the SDK
memory store changes.

The user wants the correct ownership boundary:

- SDK owns memory-store semantics and should expose a product-level memory
  invalidation event.
- Electron main should forward the SDK-owned event only.
- Renderer should reload display data through existing SDK-shaped
  `memories.list` commands.
- The old completed-turn memory diagnostic event path should be removed rather
  than preserved as a parallel event contract.

## Architectural Change

Current behavior:

```text
ConversationRuntime persists completed-turn memory
  -> emits memory_persistence_diagnostic
  -> Electron main forwards normal conversation event/current-turn rows
  -> Memory panel remains stale unless reopened or reloaded by unrelated state
```

Target behavior:

```text
ConversationRuntime persists completed-turn memory
  -> emits SDK-owned memory_store_changed event on success
  -> emits normal turn/runtime error only if persistence failure must be visible
  -> Electron main forwards windie:memory-store-changed
  -> Renderer Memory panel reloads memories.list for matching user/type
```

The old completed-turn `memory_persistence_diagnostic` event should be deleted
from the SDK/runtime contract unless inspection finds a non-renderer caller that
still needs a replacement. If persistence failure visibility is still required,
use an existing runtime error/status path or a narrowly named failure event, not
a memory-refresh diagnostic event.

## Source Of Truth Changes

- SDK `ConversationRuntime` becomes the source of truth for memory-store
  invalidation after SDK-owned completed-turn memory persistence succeeds.
- `memory_persistence_diagnostic` is not retained as a parallel completed-turn
  memory event contract.
- Electron main remains a transport boundary and does not decide whether memory
  changed.
- Renderer memory surfaces treat invalidation as a refresh signal only and
  continue to load data through `DesktopMemoryRuntimeClient`.

## Runtime Boundaries

- SDK runtime owns:
  - event type definition
  - event emission after successful completed-turn memory persistence
  - payload semantics such as user id, conversation ref, memory types, reason,
    and memory id when available
  - deletion or replacement of the old `memory_persistence_diagnostic` event
    path
- Electron main owns:
  - IPC channel registration/allowlist
  - forwarding `memory_store_changed` to renderer windows
- Renderer owns:
  - subscribing while Memory panel is mounted
  - filtering to current `userId`
  - calling `loadMemories()`
  - rendering the refreshed counts/list
- Sidecar owns:
  - actual memory row/index persistence behind existing SDK/local-runtime RPCs

## Out Of Scope

- Changing completed-turn memory content format.
- Changing memory DB schema.
- Changing semantic summarization behavior.
- Migrating or rewriting existing memory rows.
- Redesigning the Memory panel UI.
- Making renderer call sidecar memory RPCs directly.
- Treating `memory_persistence_diagnostic` as the Memory panel refresh contract.
- Keeping `memory_persistence_diagnostic` as a compatibility event after the new
  event is implemented.

## Conceptual Code

These snippets show the intended architecture. The implementation must inspect
the current code and fit the existing naming/tests.

### SDK Event Type

```ts
export type ConversationEventType =
  | 'memory_store_changed';

export type MemoryStoreChangedPayload = {
  userId: string;
  conversationRef?: string | null;
  memoryTypes: Array<'episodic' | 'semantic'>;
  reason: 'completed_turn' | 'delete' | 'clear' | 'semanticization';
  memoryId?: string | null;
};
```

### SDK Runtime Emission

```ts
const memoryId = await storeCompletedTurnMemory(...);

await this.applyEvent(createConversationEvent({
  eventId: this.nextLocalEventId(event.turnRef, 'memory_store_changed'),
  type: 'memory_store_changed',
  conversationRef: event.conversationRef,
  revisionId: event.revisionId,
  turnRef: event.turnRef,
  source: 'sdk',
  payload: {
    userId: this.options.userId,
    conversationRef: event.conversationRef,
    memoryTypes: ['episodic'],
    reason: 'completed_turn',
    memoryId,
  },
}));
```

If the existing memory persistence helper does not return `memoryId`, either
add a narrow return value or emit the invalidation without `memoryId`. The
refresh contract must not depend on a memory id being present.

### Old Event Deletion

The implementation should remove the completed-turn diagnostic event path:

```ts
// Delete this as the normal completed-turn memory contract.
await this.applyEvent(createConversationEvent({
  type: 'memory_persistence_diagnostic',
  payload: { stage: 'store_succeeded' },
}));
```

If tests currently assert `memory_persistence_diagnostic`, update them to assert
`memory_store_changed` for success and an explicit skipped/failure behavior for
non-success cases.

### Electron Main Forwarding

```js
detachRuntimeEvents = runtime.subscribeEvents((event, snapshot) => {
  broadcastToRenderers('windie:conversation-event', event);
  broadcastToRenderers('windie:rows', snapshot.displayRows);
  broadcastToRenderers('windie:current-turn', snapshot.currentTurn);

  if (event?.type === 'memory_store_changed') {
    broadcastToRenderers('windie:memory-store-changed', event);
  }
});
```

### Renderer Memory Panel Refresh

```tsx
useEffect(() => {
  if (!userId || userId === 'default_user') {
    return undefined;
  }

  return IpcBridge.on(ON_CHANNELS.WINDIE_MEMORY_STORE_CHANGED, (event) => {
    const eventUserId = event?.payload?.userId ?? event?.userId;
    if (eventUserId === userId) {
      void loadMemories();
    }
  });
}, [userId, loadMemories]);
```

## Ordered Plan

1. Inspect current SDK conversation event types, memory persistence helper
   return shape, and `ConversationRuntime.persistCompletedTurnMemory()`.
2. Identify all `memory_persistence_diagnostic` producers and consumers, then
   classify whether each should be deleted or replaced by a clearer non-success
   signal.
3. Add a canonical SDK `memory_store_changed` conversation event type and
   payload handling with the smallest compatible type change.
4. Emit `memory_store_changed` only after successful completed-turn episodic
   memory persistence.
5. Remove `memory_persistence_diagnostic` from the normal completed-turn memory
   persistence path and from tests/docs that present it as a supported event.
6. Add a renderer IPC on-channel for `windie:memory-store-changed` in the shared
   channel registry and preload/channel tests.
7. Forward SDK `memory_store_changed` events from Electron main to renderer on
   the new channel while preserving existing `windie:conversation-event`
   behavior.
8. Update `MemorySection` to subscribe to the new channel and reload memories
   for the active authenticated user.
9. Add/update focused tests:
   - SDK conversation runtime emits `memory_store_changed` after successful
     completed-turn memory persistence.
   - SDK does not emit success invalidation when memory persistence is skipped
     or fails.
   - SDK no longer emits `memory_persistence_diagnostic` for completed-turn
     memory success/skips/failures unless inspection finds a separately
     approved replacement requirement.
   - Electron/channel registry exposes the new on-channel.
   - Memory panel reloads when a matching user invalidation arrives.
   - Memory panel ignores invalidations for other users.
10. Update docs and `CHANGELOG.md`.
11. Run validation commands and commit if implementation is approved.

## Checklist

- [ ] SDK event type and payload added.
- [ ] SDK emits event after successful completed-turn memory persistence.
- [ ] SDK skip/failure behavior does not emit false invalidation.
- [ ] Old completed-turn `memory_persistence_diagnostic` event path removed or
      explicitly replaced with a clearer approved failure/status path.
- [ ] Electron main forwards the event on a dedicated memory-store channel.
- [ ] Shared IPC/preload channel allowlists include the new channel.
- [ ] Memory panel refreshes from the invalidation event.
- [ ] Renderer does not use `memory_persistence_diagnostic` as the refresh
      contract.
- [ ] Tests/docs no longer present `memory_persistence_diagnostic` as the
      completed-turn memory contract.
- [ ] Focused tests added or updated.
- [ ] Docs updated.
- [ ] `CHANGELOG.md` updated.
- [ ] Matching report created during implementation.
- [ ] Validation results recorded in the report.
- [ ] Commit created and recorded in the report.

## Success Criteria

- After a completed turn successfully stores episodic memory, an open Memory
  panel refreshes and shows the new episodic count without closing/reopening.
- The Memory panel refresh path is driven by a product-level
  `memory_store_changed` event, not by parsing diagnostic/progress events.
- `memory_persistence_diagnostic` is removed from the completed-turn memory
  success path and is not kept as a compatibility event.
- Renderer still loads memory data through SDK-shaped `memories.list`.
- Electron main only forwards the SDK event; it does not inspect sidecar DB
  state or decide memory semantics.
- Existing chat transcript/current-turn behavior does not regress.
- Failed or skipped memory persistence does not trigger a false memory-list
  refresh.
- Failed or skipped memory persistence has an explicit final behavior: either
  visible through an existing runtime error/status path or intentionally quiet
  with tests documenting no invalidation.

## Validation Commands

Planned focused validation:

```bash
./bin/docs-list
cd frontend && npm run test -- --runTestsByPath \
  ../tests/frontend/WindieSdkConversationRuntime.test.ts \
  ../tests/frontend/MemorySection.test.jsx \
  ../tests/frontend/IpcChannels.test.ts \
  ../tests/frontend/PreloadIpcChannels.test.cjs
cd frontend && npm run typecheck
cd packages/windie-sdk-js && npm run build
git diff --check
```

If any listed test path does not match the final touched files, replace it with
the nearest focused test file and record the reason in the report.

## Assumptions

- Completed-turn episodic memory persistence already works; current SQLite
  inspection confirmed one `memories` row after a fresh turn.
- This change does not need a DB migration.
- This change does not need a backend route change.
- The memory-store invalidation event can be modeled as an SDK conversation
  event unless inspection finds a better existing SDK event bus for
  cross-surface store invalidation.
- If future delete/clear/semanticization invalidations are not implemented in
  this slice, the event payload should still leave room for those reasons.
