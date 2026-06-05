---
summary: "Plan for moving user-facing renderer commands to SDK-shaped invokes handled by Electron main through public SDK APIs."
read_when:
  - When renderer code invokes memory, conversation, send, stop, history, delete, clear, search, or replay commands.
  - When adding or removing Electron IPC channels that represent SDK-owned user-facing behavior.
title: "SDK-Shaped Renderer Invoke Refactor Plan"
---

# SDK-Shaped Renderer Invoke Refactor Plan

## User Intent

The user wants WindieOS UI/runtime ownership cleaned up so renderer code only
expresses user intent and displays SDK projections. User-facing commands for
memory, conversations, send, stop, history, delete, clear, search, and replay
must be SDK-shaped public commands. Electron main may transport those commands,
but it must execute them through the live SDK runtime instead of exposing
sidecar/internal IPC names to renderer feature code.

The user specifically wants the nuke features to become foundational instead of
vague:

- clearing chats deletes chat-owned persistence, including transcript events,
  revision metadata, and titles
- clearing memories deletes memory-owned persistence, vector/index metadata,
  and semanticization state without deleting chat transcripts
- destructive actions must not silently fall back to `default_user`

## Architectural Change

Renderer command ownership must be deterministic:

```text
Renderer display/user intent
  -> one SDK-shaped invoke bridge
  -> Electron main allowlist
  -> live Windie SDK public API
  -> SDK store/local-runtime abstractions
  -> sidecar storage/tool implementation details
```

Renderer feature code must not call sidecar/internal IPC names for SDK-owned
concepts such as conversations, memory, send, stop, history, delete, clear,
search, or replay. If a public SDK command exists, Electron main must call it.
If it does not exist, add it to the SDK before exposing the command to renderer.

Conceptually, this moves the user-facing command source of truth:

```text
Before:
Renderer feature/runtime client
  -> sidecar-shaped IPC channel
  -> Electron main RPC mapper
  -> sidecar storage implementation

After:
Renderer feature/runtime client
  -> SDK-shaped command invoke
  -> Electron main strict command allowlist
  -> live WindieAgent / ConversationRuntime public API
  -> SDK store/local-runtime abstraction
  -> sidecar storage implementation detail
```

## Current Findings

- Renderer memory actions still go through `DesktopMemoryRuntimeClient`, which
  invokes sidecar-shaped channels such as `list-episodic-memories`,
  `delete-semantic-memory`, `clear-local-memory`, and `clear-chat-history`.
- Renderer conversation browsing still uses SDK store adapters that map
  `SidecarConversationStore` RPC methods to sidecar-shaped IPC channels. This
  is acceptable only as a store adapter implementation detail, not as a
  renderer feature API.
- SDK already exposes public conversation methods on `WindieAgent`:
  `listConversations`, `searchConversations`, `deleteConversation`, and
  `loadConversation`.
- SDK already exposes public memory methods on `WindieAgent`: `listMemories`
  and `deleteMemory`.
- SDK does not yet expose public clear-all semantics for local memory or chat
  history.
- Sidecar `clear_chat_history` currently deletes `chat_events` and
  `conversation_titles`, but not `chat_conversation_revisions`, which leaves
  revision-only ghost conversations possible.
- Existing `default_user` fallback is used by destructive settings actions when
  renderer session identity is not hydrated. Destructive user-facing actions
  should fail until a real user id is available.

## Assumptions

- Electron main already starts the live SDK runtime with
  `new WindieClient(...).wakeUp(...)` and retains access to the active
  `WindieAgent` or conversation runtime.
- Existing sidecar RPC methods may remain as SDK local-runtime/store internals
  during this refactor, as long as renderer feature code does not call them as
  user-facing app API.
- The first implementation should focus on memory and conversation user-facing
  commands because those currently expose sidecar-shaped names to renderer
  paths and tests.
- Send/stop can be routed through the same SDK-shaped invoke bridge after the
  command allowlist exists, but this plan must not regress the already working
  `windie:send` and `windie:stop` behavior.
- No persisted-data migration is required for schema shape if the
  implementation only deletes existing rows during explicit destructive
  actions. Tests must still prove clear semantics.

## Out Of Scope

- Rebuilding the minimal chat pill or response overlay UI.
- Replacing all Electron-native IPC commands. Window, permission, artifact,
  onboarding, clipboard, and overlay commands can stay Electron-shaped because
  they are Electron-owned.
- Removing all sidecar RPC channels in one pass. Sidecar RPC remains valid
  behind SDK local-runtime/store abstractions.
- Changing backend prompt, provider, websocket, compaction, or tool-loop
  semantics.
- Changing public SDK package publishing/versioning.
- Performing broad renderer folder reorganization beyond files needed to route
  the command boundary.

## Ownership Contract

SDK owns:

- public user-facing command names and semantics
- conversation list/search/load/delete/clear
- memory list/delete/clear
- send/stop/rehydrate/compact/runtime projections
- display rows and current-turn projections

Electron main owns:

- the strict invoke allowlist
- locating the live `WindieAgent` / conversation runtime
- converting renderer invoke payloads into SDK public API calls
- returning stable success/error envelopes

Renderer owns:

- UI intent and display only
- calling SDK-shaped commands through the bridge
- rendering SDK projections and returned data

Sidecar owns:

- SQLite/FAISS storage mechanics
- local tool execution
- RPC methods used internally by SDK local-runtime/store adapters

## SDK-Shaped Invoke Contract

Use one renderer command surface:

```ts
window.windie.invoke('memories.list', { type: 'episodic', userId, limit });
window.windie.invoke('memories.delete', { type: 'semantic', userId, memoryId });
window.windie.invoke('memories.clearAll', { userId });
window.windie.invoke('conversations.list', { userId, limit });
window.windie.invoke('conversations.search', { userId, query, limit });
window.windie.invoke('conversations.delete', { userId, conversationRef });
window.windie.invoke('conversations.clearAll', { userId });
window.windie.invoke('conversation.send', payload);
window.windie.invoke('conversation.stop', payload);
```

Electron main must implement this as a named allowlist, not arbitrary method
path execution.

## Ordered Plan

1. Confirm current command ownership by re-running the search list in this plan
   and classifying every hit as renderer feature API, Electron allowlist,
   SDK/local-runtime internal, or unrelated Electron-native IPC.
2. Reread the files and docs named by the deterministic findings. Continue
   reading and searching until every relevant code path is either already
   target-architecture compliant, explicitly in scope for this plan, preserved
   as SDK/local-runtime internal behavior, or out of scope because it is
   Electron-native behavior.
3. Add missing SDK public APIs before changing renderer callers:
   `WindieAgent.clearMemories(...)` and
   `WindieAgent.clearConversations(...)`.
4. Extend SDK store abstractions only where needed to support those public
   APIs. Implement clear-all conversation behavior for in-memory, file, and
   sidecar-backed stores.
5. Fix sidecar destructive storage semantics so chat clear deletes
   `chat_events`, `chat_conversation_revisions`, and `conversation_titles`,
   while memory clear preserves chats.
6. Add a single SDK-shaped renderer invoke channel and preload bridge, with a
   strict Electron main command allowlist.
7. Route allowlisted memory and conversation commands in Electron main to the
   live SDK public APIs.
8. Move renderer memory settings/list/delete/clear calls to SDK-shaped command
   invokes.
9. Remove destructive `default_user` fallback from nuke actions and make missing
   user identity a visible error.
10. Update wording for the nuke UI so labels match implementation semantics.
11. Re-run the inspection searches after implementation. Continue rereading and
    fixing until no renderer-facing SDK-owned command path remains on the old
    sidecar-shaped architecture unless it is documented as internal or out of
    scope.
12. Add focused SDK, frontend, and sidecar tests for the new ownership boundary.
13. Update architecture/docs references and `CHANGELOG.md`.
14. Run validation, fix failures within the approved scope, write the matching
    report file, then commit scoped changes only.

## Inspection Procedure For Future Continuation

Do not assume file names stayed stable. Repeat this inspection before widening
the refactor:

1. Run `./bin/docs-list`.
2. Read the nearest `read_when` docs for renderer/main/SDK ownership and
   storage changes.
3. Inspect recent commits for touched renderer runtime, Electron IPC, SDK
   runtime/store, sidecar memory, tests, and docs files.
4. Search renderer/main/tests for:
   - `IpcBridge.invoke`
   - `INVOKE_CHANNELS`
   - `clear-chat-history`
   - `clear-local-memory`
   - `delete-chat-conversation`
   - `list-chat-conversations`
   - `search-chat-conversations`
   - `get-chat-events`
   - `delete-episodic-memory`
   - `delete-semantic-memory`
   - `list-episodic-memories`
   - `list-semantic-memories`
   - `DesktopMemoryRuntimeClient`
   - `DesktopConversationLibraryClient`
   - `DesktopLiveTurnRuntimeClient`
   - `DesktopTranscriptProjectionRuntimeClient`
5. For each hit, classify it as:
   - renderer feature API that must move to SDK-shaped invoke
   - Electron main transport/allowlist code
   - SDK store/local-runtime implementation detail
   - unrelated Electron-native window/permission/artifact command
6. After writing deterministic findings, do a full reread pass before editing.
   The reread must include the concrete files found in steps 4-5 plus the
   nearest docs for frontend architecture, SDK conversation/runtime ownership,
   and storage persistence.
7. Keep inspecting until every hit is accounted for in one of these states:
   - already implemented according to the target architecture
   - will be changed by this plan
   - remains intentionally as SDK/local-runtime internals
   - remains out of scope because it is Electron-native behavior, not an
     SDK-owned user-facing command
8. Do not start implementation while any renderer-facing SDK-owned command path
   is still unclassified.
9. Check whether the SDK already has a public API. If yes, route main to it.
10. If no SDK API exists, add the SDK public API first, backed by existing SDK
   store/local-runtime abstractions.
11. Delete or narrow the old renderer-facing internal IPC path once replaced.
12. Add focused tests for the new public command and the deleted old path.
13. Update docs and `CHANGELOG.md`.
14. Commit completed work without staging unrelated dirty files.

## Implementation Slices

### Slice 1: SDK Public Commands

- Add SDK clear-all conversation support through the `ConversationStore`
  interface.
- Implement `clearAllConversations` for in-memory, file, and sidecar-backed
  stores.
- Add `WindieAgent.clearConversations(...)` as the public conversation command.
- Add `WindieAgent.clearMemories(...)` as the public memory command.
- Keep memory clear semantics explicit: clear episodic interaction memory,
  semantic memory, vector/index metadata, and semanticization watermark; do not
  delete chat transcripts.

### Slice 2: Sidecar Storage Semantics

- Make chat clear delete all chat-owned persistence:
  `chat_events`, `chat_conversation_revisions`, and `conversation_titles`.
- Keep memory clear separate from chat history.
- Prefer deriving conversation existence from chat events. If revision-only
  metadata remains listed, document why; otherwise remove it from list results.

### Slice 3: Electron Main SDK Command Allowlist

- Add a single SDK-shaped invoke channel such as `windie:invoke`.
- Add a strict command allowlist in Electron main.
- Route memory list/delete/clear and conversation list/search/delete/clear to
  public `WindieAgent` methods.
- Keep sidecar-shaped RPC channels only for SDK store/local-runtime internals
  during this phase.

### Slice 4: Renderer Runtime Clients

- Add a tiny renderer helper for SDK-shaped invokes.
- Change `DesktopMemoryRuntimeClient` to call SDK-shaped command names instead
  of sidecar-shaped IPC channels.
- Remove destructive `default_user` fallback; settings destructive actions must
  fail with a clear message if no user id is available.
- Update nuke wording:
  - "Delete saved memories": deletes saved episodic interaction memories and
    semantic memories; chat transcripts remain.
  - "Delete chat history": deletes saved chat transcripts, revisions, and
    titles; memories remain.

### Slice 5: Tests And Docs

- SDK tests:
  - `clearMemories` calls local runtime `clear_local_memory`.
  - `clearConversations` calls the store clear API.
  - sidecar store clear calls the expected local-runtime RPC.
- Frontend tests:
  - renderer memory runtime client calls `windie:invoke` with SDK-shaped
    command names.
  - preload allows the SDK invoke channel.
  - Electron main allowlist calls SDK public methods and rejects unknown
    commands.
  - dashboard boundary tests reject sidecar-shaped memory IPC in dashboard code.
- Sidecar tests:
  - `clear_chat_history` deletes chat events, revision metadata, and titles.
  - conversation list does not expose revision-only ghost chats after clear.
- Docs:
  - update frontend architecture/IPC docs where they still describe
    renderer-facing sidecar memory/chat channels as user-facing API.
  - update `CHANGELOG.md`.

## Checklist

- [ ] Current renderer/main/SDK/sidecar command paths inspected and classified.
- [ ] Post-findings reread completed for all relevant owner files and docs.
- [ ] No renderer-facing SDK-owned command path remains unclassified.
- [ ] Missing SDK clear APIs added before renderer routing changes.
- [ ] Conversation clear semantics implemented through SDK store abstractions.
- [ ] Memory clear semantics remain memory-only and chat-preserving.
- [ ] Sidecar chat clear deletes events, revisions, and titles.
- [ ] Renderer command calls use SDK-shaped command names for memory nuke/list/delete.
- [ ] Electron main handles SDK-shaped commands through a strict allowlist.
- [ ] Old renderer-facing sidecar-shaped memory command path is deleted or
      proven internal-only.
- [ ] Destructive `default_user` fallback removed from nuke actions.
- [ ] Nuke UI wording matches actual persistence semantics.
- [ ] Final inspection search proves remaining old sidecar-shaped command paths
      are either deleted, target-compliant, SDK internals, or documented
      out-of-scope Electron-native behavior.
- [ ] Focused tests added/updated.
- [ ] Docs and `CHANGELOG.md` updated.
- [ ] Matching report file created/updated during execution.
- [ ] Completed implementation committed without unrelated dirty files.

## Success Criteria

- Renderer feature code no longer invokes sidecar-shaped memory clear/list/delete
  channels for user-facing memory actions.
- Electron main is the only renderer-command transport owner and calls public
  SDK APIs for allowlisted SDK-shaped commands.
- SDK owns the public command names and clear semantics.
- Sidecar storage remains an implementation detail behind SDK local-runtime or
  store abstractions.
- `Nuke chats` removes chat event rows, chat revision metadata, and conversation
  titles, and does not remove memory rows.
- `Nuke memory` removes saved interaction memories, semantic memories, vector
  metadata/index artifacts, and semanticization watermark state, and does not
  remove chat transcripts.
- Missing user identity blocks destructive nuke actions with a clear error
  instead of falling back to `default_user`.
- Existing send/stop, dashboard conversation list/search/load/delete, memory
  listing, and minimal chat pill display behavior do not regress.
- Tests prove the ownership boundary and destructive storage semantics.

## Validation

Run:

```text
./bin/docs-list
cd frontend && npm run test -- DesktopMemoryRuntimeClient PreloadIpcChannels IpcMainSdkRuntimeBoundary RendererDashboardRuntimeBoundary
cd packages/windie-sdk-js && npm run build
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_store_delete_cleanup.py tests/sidecar/test_chat_event_store.py
git diff --check
```

Broaden frontend or SDK tests if the implementation touches more than the
memory/conversation command boundary.

## Execution Report Requirement

When this plan is approved and implementation begins, create or update:

```text
docs/plans/2026-06-05-sdk-shaped-renderer-invoke-refactor-report.md
```

The report must:

- link this plan
- track checklist and success-criteria status
- document every commit created for the plan
- record validation commands and results
- note decisions, tradeoffs, blockers, and deviations from the approved plan

Do not commit implementation work until the report is updated with the actual
execution state.

## Approval Gate

Stop after writing or updating this plan. The user must read and approve the
plan before any code implementation begins. If the user changes direction,
update this plan first and ask for approval again.
