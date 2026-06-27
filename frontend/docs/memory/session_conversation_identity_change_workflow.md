---
summary: "Workflow for changing WindieOS user/session/conversation identity, transcript sync, replay, rehydrate, active-turn filtering, and wrong-conversation routing."
read_when:
  - When changing `user_id`, `session_id`, `conversation_ref`, `turn_ref`, transcript-session sync, dashboard resume, rehydrate payloads, stop-query routing, or active stream filtering.
  - When debugging messages, tool calls, tool results, screenshots, memory rows, dashboard conversations, VM runs, or backend history landing in the wrong conversation.
  - When changing renderer transcript identity, Electron main transcript sync, backend session registry behavior, local-runtime transcript storage identity, or replay/rehydrate linkage.
title: "Session and Conversation Identity Change Workflow"
---

# Session and Conversation Identity Change Workflow

Use this workflow before changing identity or conversation routing. WindieOS has several related identifiers, and collapsing them creates subtle bugs: old context continuing in a new chat, tool results resolving against the wrong backend session, replay rows showing in the wrong dashboard thread, or a stopped query canceling the wrong turn.

The core rule is: preserve the durable conversation key separately from live backend session state. `conversation_ref` is the durable conversation/thread key. `session_id` is live runtime context. `turn_ref` is one user turn. `user_id` scopes ownership.

## Fast Owner Map

| Change or symptom | First owner | Code roots | Start docs | Focused tests |
| --- | --- | --- | --- | --- |
| create, normalize, reset, or switch `conversation_ref` | renderer transcript/session runtime | `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`, `frontend/src/renderer/app/runtime/desktopConversationSessionRuntime.ts`, `frontend/src/renderer/app/runtime/desktopActiveChatSessionRuntime.ts`, `frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts`, `frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient.ts`, `frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding.js` | [Sessions and Conversations](../concepts/sessions_and_conversations.md), [Transcript and Replay](transcript_and_replay.md) | `tests/frontend/ConversationSessionRuntime.test.ts`, `tests/frontend/ResetActiveChatSession.test.ts`, `tests/frontend/ChatSessionBootstrap.test.tsx`, `tests/frontend/NewChatSession.test.ts` |
| sync active conversation/user identity between renderer windows and Electron main | main IPC transcript sync | `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`, `frontend/src/main/ipc/ipc_event_replay_state.cjs`, renderer transcript sync helpers | [IPC Event Replay and Transcript Session Sync Reference](../frontend/main/ipc_event_replay_and_transcript_session_sync_reference.md) | `tests/frontend/IpcTranscriptSessionSync.test.cjs`, `tests/frontend/TranscriptSessionSyncPayload.test.ts` |
| query starts with old or missing conversation identity | renderer query payload and main query runtime | `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`, `frontend/src/main/ipc.cjs`, query payload builders | Query Lifecycle Change Workflow (private backend docs), [Transcript Session and Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md) | `tests/frontend/ChatPillSessionFlow.test.ts`, `tests/frontend/IpcQueryRuntime.test.cjs`, backend query input tests |
| backend continues an old conversation or creates duplicate sessions | backend session registry/manager | `backend/src/agent/session/session_registry.py`, `backend/src/agent/session/manager.py`, `backend/src/agent/session/conversation_refs.py` | Backend Session Runtime and Config Rewire Reference (private backend docs), [Session and Transcript Reference](../reference/session_and_transcript_reference.md) | `tests/backend/test_session_manager.py`, `tests/backend/test_session_registry.py`, `tests/backend/test_session_cleanup.py` |
| stop-query cancels the wrong turn or wrong conversation | backend active query tracker plus renderer stop payload | `backend/src/agent/session/active_query_tracker.py`, `backend/src/api/handlers/stop_query.py`, renderer stop controls | Query Lifecycle Change Workflow (private backend docs) | backend stop/query tests and SDK/renderer stream/stop tests |
| stream chunks, tool rows, or completion events appear in the wrong chat | renderer active stream/conversation gate | `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`, stream hooks, transcript writer call sites | [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md), [Conversation Gate Reference](../frontend/renderer/chat/stream/conversation_gate_and_active_turn_filtering_reference.md) | `tests/frontend/DesktopChatStreamIngressRuntime.test.ts`, `tests/frontend/ChatStream*.test.ts` |
| visible transcript row does not persist or persists under wrong conversation | SDK projection store and local-runtime event store path | `packages/windie-sdk-js/src/stores`, `packages/windie-sdk-js/src/runtime/Agent.ts`, `frontend/src/main/python/memory/local_store.py` | [Transcript and Replay](transcript_and_replay.md), [Transcript Session and Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md) | SDK/main projection tests, local-runtime Python transcript tests |
| dashboard resume displays rows but backend forgets context | SDK rehydrate projection plus backend rehydrate service | `packages/windie-sdk-js/src/projections`, `backend/src/api/handlers/rehydrate.py`, `backend/src/api/services/rehydrate_*` | [Memory Change Workflow](memory_change_workflow.md), Backend History and Semantic Routes (private backend docs) | SDK rehydrate tests, `tests/backend/test_rehydrate_*.py` |
| tool-call/tool-output linkage breaks after replay or rehydrate | SDK tool projection state plus backend rehydrate linkage/history | SDK tool projection files, `backend/src/api/services/rehydrate_tool_*`, `backend/src/agent/history/*` | [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md), Backend History Tool-Call ID Staging Reference (private backend docs) | SDK tool projection tests, `tests/backend/test_rehydrate_tool_linkage.py`, `tests/backend/test_conversation_history.py` |
| conversation list/search/title/delete behavior drifts | local-runtime memory and dashboard views | `frontend/src/main/python/memory/conversation_*`, dashboard hooks, local conversation store | [Local Runtime Memory](sidecar_local_memory.md), [Memory Troubleshooting](memory_troubleshooting.md) | `tests/sidecar/test_conversation_*.py`, dashboard conversation tests |
| VM run opens or resumes the wrong conversation | runs API metadata and VM worker dispatch | `backend/src/api/routes/runs`, `backend/src/services/vm_run_control.py`, `frontend/src/main/app/vm_worker_runtime.cjs` | VM Runs and Workers (private backend docs), Runs API Runbook (private backend docs) | backend runs tests, frontend VM worker tests |

## Identifier Boundaries

| Identifier | Durable? | Primary owner | Rule |
| --- | --- | --- | --- |
| `user_id` / `userId` | yes | hosted backend identity, Electron main status, renderer transcript state | Use authenticated hosted identity when available. Scope backend sessions, local transcript rows, memory, settings, and search by user. |
| `conversation_ref` / `conversationRef` | yes | renderer transcript runtime and backend session registry | Use as the stable conversation/thread key across transcript, backend history, replay, rehydrate, stale-event filtering, and VM run metadata. |
| `session_id` / `sessionId` | no | hosted backend runtime/websocket | Treat as live runtime context. Do not use it as durable conversation identity when `conversation_ref` exists. |
| `turn_ref` | no | renderer send path and backend stream events | Use to correlate one user turn, stream events, stop-query, stale-turn filtering, and tool execution. |
| `tool_call_id` | yes within model history | backend/provider history and transcript tool rows | Preserve across transcript, replay, rehydrate, and strict provider history. |
| `request_id` / `correlation_id` | no to semi-durable | backend tool wait path, SDK/main tool coordinator, transcript projection persistence | Use to resolve in-flight tool results and reconstruct UI/tool rows. Preserve until result/history conversion completes. |
| `message_index` | yes within local-runtime store | local-runtime transcript storage | Use for replay ordering, pagination, semanticization windows, and dashboard conversation views. |

## Runtime Flow

### New Conversation

1. Renderer creates a new `conversationRef` through shared session helpers.
2. Transcript session runtime stores the active `conversationRef` and `userId`.
3. Renderer sends `transcript-session-sync` to Electron main.
4. Electron main stores the latest identity fallback and rebroadcasts to other renderer windows.
5. Query payload includes the current `conversation_ref`.
6. Backend `SessionManager.get_or_create_session(user_id, conversation_ref)` normalizes the conversation ref and stores a conversation-scoped `AgentSession`.
7. Backend stream events include conversation/session/turn identity.
8. Renderer active-conversation gates accept matching events and drop stale events.
9. Transcript writer persists rows under the current `conversationRef` and `userId`.

### Resume Existing Conversation

1. Dashboard loads local-runtime transcript rows for the selected conversation.
2. Renderer converts rows to visible chat messages.
3. SDK continuity loads the active model-history checkpoint for the selected
   conversation.
4. Backend `RehydrateConversationHandler` delegates to `RehydrateExecutionService`.
5. Backend installs provider-neutral model-history rows into the
   conversation-scoped session.
6. Renderer sets active transcript session info to the resumed `conversationRef`.
7. The next query uses the same `conversation_ref`, so backend history and visible replay stay aligned.

### Stop or Cancel

1. Frontend sends stop context with user/conversation/turn data where available.
2. Backend `ActiveQueryTracker` resolves active or pending stop requests by user and normalized conversation ref.
3. Backend emits terminal/cancellation events with enough identity for renderer filters.
4. Renderer clears only matching active-turn state.

## Change Rules

- Do not create conversation refs inside random UI components. Use the shared chat/session helpers and transcript session runtime.
- Do not treat missing `conversation_ref` as equivalent to a new chat. Backend `None` can mean default/latest conversation fallback.
- Do not use `session_id` as a durable storage key for transcript rows, memory, dashboard resume, or VM runs.
- Normalize camelCase and snake_case identity aliases at process boundaries, then use one internal shape.
- Preserve `conversation_ref`, `turn_ref`, tool-call ids, request ids, and screenshots through renderer, Electron, local-runtime transcript storage, backend rehydrate, and backend history when a row can later be replayed.
- Keep hidden replay-state rows and visible conversation rows in the same delete/lifecycle path.
- When a change affects both dashboard and minimal chat pill, test both. They can be separate renderer windows with shared session sync.
- When a hosted backend has authenticated identity, do not trust renderer-owned `user_id` for access control.

## Change Paths

### Change Conversation Creation or Switching

1. Read [Sessions and Conversations](../concepts/sessions_and_conversations.md) and [Session and Transcript Reference](../reference/session_and_transcript_reference.md).
2. Update shared renderer helpers under `frontend/src/renderer/app/runtime/*SessionRuntime*`; chat creation/reset helpers are app-runtime-owned and should not be reintroduced under `frontend/src/renderer/features/chat/utils/session`.
3. Update transcript runtime only if storage/sync semantics change.
4. Update Electron main sync if other windows or query fallback identity need the new field.
5. Update backend session manager only if server-side lookup semantics change.
6. Validate chat bootstrap, new chat, dashboard resume, and main-process transcript sync.

### Change Stream Event Identity or Filtering

1. Update backend event/formatter identity fields at the source, not just renderer parsing.
2. Preserve `conversation_ref`, `session_id`, and `turn_ref` on terminal and error events.
3. Update renderer active-turn/conversation gate logic.
4. Add stale-event tests for old conversation, old turn, and missing identity cases.
5. Update websocket event and streaming docs if event shape changes.

### Change Replay or Resume

1. Keep renderer replay display separate from backend model-history install.
2. Update SDK model-history checkpoint persistence/payload conversion when backend resume needs different rows.
3. Update backend rehydrate install, transparency restoration, and tool-linkage validation together.
4. Preserve valid tool-call/tool-output pairs and prune or synthesize only where strict provider history requires it.
5. Validate frontend model-history resume tests and backend rehydrate execution/linkage tests.

### Change Transcript Storage or Conversation Lists

1. Update renderer transcript writer and local-runtime memory storage together when the persisted payload changes.
2. Keep `conversation_ref`, `user_id`, role, message type, timestamp, and message index stable.
3. Update dashboard list/search/title/delete consumers when storage fields or query ordering change.
4. Validate frontend transcript/pending tests and local-runtime Python conversation list/search/title tests.

### Change Backend Session Registry Behavior

1. Update `conversation_refs.py` only for shared normalization rules.
2. Update `SessionRegistry` when map shape, latest-conversation fallback, connection count, or locking behavior changes.
3. Update `SessionManager` when creation, cleanup, active query tracking, or session config propagation changes.
4. Keep per-user locks around session creation/end behavior.
5. Validate duplicate-create races, cleanup, default conversation fallback, and multi-conversation lookup.

## Debug Checklist

### Message Lands in Wrong Chat

- Confirm renderer active `conversationRef` before send.
- Confirm `transcript-session-sync` reached Electron main.
- Confirm query payload carries the intended `conversation_ref`.
- Confirm backend session manager stored the session under the same normalized conversation ref.
- Confirm stream events carry matching `conversation_ref` and renderer gate accepts only matching events.

### Backend Continues Old Context After Resume

- Confirm dashboard loaded the intended conversation rows from local-runtime transcript storage.
- Confirm rehydrate payload contains the selected `conversation_ref`.
- Confirm backend rehydrate service targeted the same conversation-scoped session.
- Confirm tool-call/tool-output rows were repaired or pruned before provider history.
- Confirm the next query used the resumed `conversation_ref`, not Electron main's stale fallback.

### Tool Result Cannot Find Session

- Confirm backend stored the resolved tool call or pending result under the session that owns the request id.
- Confirm renderer preserved request id/correlation id through tool execution.
- Confirm tool result submission includes enough user/session/conversation context or request id for backend lookup.
- Confirm `SessionManager.get_session_for_request_id(...)` or bundle lookup can find the owning session.

### Deleted Conversation Still Appears

- Confirm renderer local replay state is cleared.
- Confirm local-runtime transcript rows and derived conversation summaries/titles were deleted or invalidated.
- Confirm search/list caches are refreshed.
- Confirm semantic derived rows are intentionally retained or removed according to memory docs.

## Validation Matrix

| Changed surface | Minimum checks |
| --- | --- |
| renderer conversation creation/switching | `cd frontend && npm run test -- ConversationSessionRuntime ChatSessionBootstrap NewChatSession ResetActiveChatSession` |
| transcript sync through Electron main | `cd frontend && npm run test -- IpcTranscriptSessionSync TranscriptSessionSyncPayload` |
| query identity/stream filtering | frontend chat-stream/conversation-gate tests plus backend query input/session tests |
| backend session registry/manager | `./scripts/python-in-env backend pytest tests/backend/test_session_manager.py tests/backend/test_session_registry.py tests/backend/test_session_cleanup.py` |
| replay/rehydrate payload | `<windie> test frontend -- AgentSdkConversationRuntime ConversationReplayActions DesktopConversationReplayRuntime` |
| backend rehydrate services | `./scripts/python-in-env backend pytest tests/backend/test_rehydrate_execution_service.py tests/backend/test_rehydrate_tool_call_normalization.py tests/backend/test_rehydrate_tool_linkage.py` |
| local-runtime Python conversation storage/list/search/title | `./scripts/python-in-env local-runtime pytest tests/sidecar/test_conversation_*.py` |
| docs-only identity workflow | `<windie> docs list`, `git diff --check`, focused Markdown link check |

## Review Checklist

- `conversation_ref` remains durable and separate from `session_id`.
- Identity alias normalization happens at the boundary, not repeatedly in every consumer.
- New chat, dashboard resume, edit/resend, try-again, stop-query, and tool-result paths all carry compatible identity.
- Renderer replay and backend rehydrate remain separate but use the same stored transcript facts.
- Active stream filtering handles stale conversation, stale turn, terminal events, and missing identity deliberately.
- Backend session cleanup clears conversation-scoped sessions without wiping unrelated active conversations for the same user.
- Local-runtime Python conversation list/search/title/delete behavior uses the same user/conversation keys as transcript writes.
- Tests cover both producer and consumer boundaries for any changed identity field.

## Related Docs

- [Sessions and Conversations](../concepts/sessions_and_conversations.md)
- [Session and Transcript Reference](../reference/session_and_transcript_reference.md)
- [Memory Change Workflow](memory_change_workflow.md)
- [Transcript and Replay](transcript_and_replay.md)
- Backend Session Runtime and Config Rewire Reference (private backend docs)
- [Frontend Transcript Session and Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)
- [IPC Event Replay and Transcript Session Sync Reference](../frontend/main/ipc_event_replay_and_transcript_session_sync_reference.md)
- Query Lifecycle Change Workflow (private backend docs)
