---
summary: "Plan for removing renderer-owned memory user-id selection so Electron main/SDK use the authenticated install user for memory commands."
read_when:
  - When debugging Memory panel counts showing zero while sidecar memory rows exist.
  - When changing renderer memory list/delete/clear commands or SDK-shaped memory IPC ownership.
title: "Memory Panel Authenticated User Ownership Plan"
---

# Memory Panel Authenticated User Ownership Plan

## User Intent

The user sent messages after clearing local memory and expected the Memory panel
to show episodic memories. Direct SQLite inspection confirmed the SDK memory
store contains completed-turn episodic memories for the authenticated install
user, and the SDK now emits `memory_store_changed` events. The Memory panel
still shows `Episodic 0`.

The bug is that renderer memory UI still decides which `userId` to use from
transcript session state:

```text
MemorySection -> useTranscriptSessionInfo().userId -> memories.list
```

That is the wrong ownership boundary. Memory rows are owned by the authenticated
SDK/install user. Renderer should not choose or validate memory user identity.
Renderer should express memory display/user intent only. Electron main / SDK
should resolve the authenticated user and call SDK memory APIs.

## Architectural Change

Current behavior:

```text
Renderer MemorySection
  -> reads transcript-session userId
  -> DesktopMemoryRuntimeClient.listEpisodicMemories(userId)
  -> windie.invoke('memories.list', { userId, type })
  -> Electron main requireCommandUserId(payload)
  -> SDK agent.listMemories({ userId, type })
```

Target behavior:

```text
Renderer MemorySection
  -> DesktopMemoryRuntimeClient.listEpisodicMemories()
  -> windie.invoke('memories.list', { type })
  -> Electron main resolves authenticated current user
  -> SDK agent.listMemories({ type }) or agent.listMemories({ userId: currentUserId, type })
  -> sidecar lists rows for authenticated user
```

Renderer should no longer pass `userId` for:

- memory list
- memory delete
- memory clear

Conversation history commands may still require explicit conversation refs and
their own identity rules; this plan is scoped to memory commands and the Memory
panel/settings surfaces.

## Source Of Truth Changes

- Authenticated install user in Electron main / SDK becomes the memory command
  identity source of truth.
- Renderer transcript session identity is not a memory identity source.
- Memory panel refresh from `windie:memory-store-changed` should filter against
  the event payload if useful, but it must not require transcript-session user
  state to list memories.
- Destructive memory actions should not use renderer-provided user ids.

## Runtime Boundaries

- SDK owns memory command semantics and local runtime RPC calls.
- Electron main owns current authenticated user resolution and strict command
  allowlist.
- Renderer owns only:
  - opening Memory panel
  - requesting list/delete/clear
  - rendering counts/items/errors
  - refreshing after `windie:memory-store-changed`
- Sidecar owns memory row/index storage for the user id it receives from SDK.

## Out Of Scope

- Changing completed-turn memory persistence.
- Changing `memory_store_changed` event emission.
- Changing memory DB schema or migrating rows.
- Changing transcript session identity behavior for chat/replay.
- Changing conversation history identity ownership.
- Redesigning Memory panel UI.
- Reintroducing `memory_persistence_diagnostic`.

## Conceptual Code

These snippets are examples of the target architecture. The implementation must
inspect the current code and use repo patterns.

### Renderer Runtime Client

```ts
type MemoryKind = 'episodic' | 'semantic';

async function listMemories(type: MemoryKind, limit: number): Promise<unknown[]> {
  const data = await invokeWindieCommand<MemoryListData>('memories.list', {
    type,
    limit,
  });
  return Array.isArray(data?.memories) ? data.memories : [];
}

export const DesktopMemoryRuntimeClient = {
  listEpisodicMemories(limit = 200) {
    return listMemories('episodic', limit);
  },

  deleteMemoryItem(input: { memoryId: string; kind: MemoryKind }) {
    return invokeWindieCommand('memories.delete', {
      memoryId: input.memoryId,
      type: input.kind,
    });
  },

  clearLocalMemory() {
    return invokeWindieCommand('memories.clearAll', {});
  },
};
```

### Memory Panel

```tsx
const loadMemories = useCallback(async () => {
  const [episodicMemories, semanticMemories] = await Promise.all([
    DesktopMemoryRuntimeClient.listEpisodicMemories(200),
    DesktopMemoryRuntimeClient.listSemanticMemories(200),
  ]);

  setMemoriesByType({
    episodic: normalizeEpisodicMemories(episodicMemories),
    semantic: normalizeSemanticMemories(semanticMemories),
    procedural: buildProceduralMemories(),
  });
}, []);
```

### Electron Main

```js
function requireAuthenticatedCommandUserId() {
  if (!currentUserId || currentUserId === 'default_user') {
    throw new Error('Windie SDK command requires an authenticated user.');
  }
  return currentUserId;
}

const sdkCommandHandlers = {
  async 'memories.list'(payload = {}) {
    const agent = await ensureWindieAgent({ reason: 'sdk-command:memories.list' });
    return agent.listMemories({
      userId: requireAuthenticatedCommandUserId(),
      type: normalizeMemoryType(payload.type),
      limit: normalizePositiveInteger(payload.limit),
    });
  },
};
```

If SDK `WindieAgent.listMemories()` can safely default to the authenticated
agent user, prefer omitting `userId` at the call site. If not, Electron main may
pass `currentUserId`; the key rule is that renderer does not provide it.

## Ordered Plan

1. Inspect current memory renderer clients, Memory panel, Memory settings
   destructive actions, Electron main `memories.*` command handlers, and SDK
   memory methods.
2. Identify every renderer caller that passes `userId` into memory list/delete
   or clear commands.
3. Change `DesktopMemoryRuntimeClient` memory list/delete/clear APIs to omit
   renderer-supplied `userId`.
4. Update `MemorySection` to stop depending on `useTranscriptSessionInfo()` for
   memory listing/deleting and to refresh on `windie:memory-store-changed`
   without requiring transcript-session identity.
5. Update memory settings actions so `Nuke memory` calls authenticated
   SDK-shaped commands without renderer user id.
6. Change Electron main `memories.list`, `memories.delete`, and
   `memories.clearAll` handlers to use the authenticated current user rather
   than `requireCommandUserId(payload)`.
7. Inspect whether other non-memory commands still need `requireCommandUserId`;
   keep it only where the command legitimately accepts explicit user identity.
8. Update focused tests:
   - `DesktopMemoryRuntimeClient` no longer sends `userId`.
   - `MemorySection` loads and refreshes without transcript session user id.
   - Memory panel refreshes after `windie:memory-store-changed`.
   - Memory settings destructive actions omit renderer `userId`.
   - Electron main memory command handlers reject missing authenticated main
     user but ignore/avoid renderer user id.
9. Update docs and `CHANGELOG.md`.
10. Create/update a matching report under `docs/plans/` during implementation.
11. Run validation and commit.

## Checklist

- [ ] Matching report created.
- [ ] Renderer memory runtime client no longer accepts/sends `userId` for
      list/delete/clear.
- [ ] Memory panel no longer uses transcript-session `userId` for memory
      list/delete.
- [ ] Memory settings destructive memory action no longer uses
      transcript-session `userId`.
- [ ] Electron main memory commands resolve authenticated current user.
- [ ] Renderer still refreshes Memory panel after `memory_store_changed`.
- [ ] Non-memory user-id command paths classified and left unchanged only when
      justified.
- [ ] Focused tests updated.
- [ ] Docs updated.
- [ ] `CHANGELOG.md` updated.
- [ ] Validation commands recorded in the report.
- [ ] Commit created and recorded in the report.

## Success Criteria

- With memory rows stored for the authenticated install user, opening the Memory
  panel shows the correct episodic count even when transcript session user id is
  null, stale, or absent.
- After a turn stores a new episodic memory, an open Memory panel refreshes from
  `windie:memory-store-changed` and displays the updated count.
- Renderer does not pass `userId` in `memories.list`, `memories.delete`, or
  `memories.clearAll` payloads.
- Electron main rejects memory commands when no authenticated current user is
  available.
- SDK/sidecar memory storage semantics remain unchanged.
- Chat transcript session identity behavior does not regress.

## Validation Commands

Planned validation:

```bash
./bin/docs-list
cd frontend && npm run test -- --runTestsByPath \
  ../tests/frontend/DesktopMemoryRuntimeClient.test.ts \
  ../tests/frontend/MemorySection.test.jsx \
  ../tests/frontend/SettingsSection.test.jsx \
  ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs
cd frontend && npm run typecheck
git diff --check
```

If implementation touches additional main-process command tests, run the
nearest focused IPC/main test and record the result in the report.

## Assumptions

- Current `memory_store_changed` event emission is working; SQLite inspection
  showed three stored `interaction` memories and three `memory_store_changed`
  events for the authenticated user.
- No DB migration is needed.
- Existing SDK memory methods can either receive Electron main's authenticated
  `currentUserId` or be made to default to the SDK agent user; renderer must not
  choose the user id.
- Conversation history commands are not changed by this plan unless inspection
  finds they share the same renderer-owned memory identity bug.
