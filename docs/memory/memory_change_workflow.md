---
summary: "Workflow for changing transcript, replay, local-runtime memory, backend history, semanticization, and compaction behavior across owning runtimes."
read_when:
  - When changing conversation persistence, replay, rehydrate, semantic memory, titles, search, backend history, or compaction.
  - When debugging missing chats, stale memory, wrong conversation ids, lost tool linkage, or semantic memory drift.
  - When deciding whether a memory issue belongs to renderer transcript, local-runtime memory storage, backend active history, or derived semantic memory.
title: "Memory Change Workflow"
---

# Memory Change Workflow

The desktop UI, local-runtime memory store, and hosted backend have multiple
memory systems. Treating them as one store causes wrong-layer fixes. Start by
identifying which memory layer owns the symptom.

## Pick the Owner

| Symptom or request | Primary owner | First code roots | Tests |
| --- | --- | --- | --- |
| Visible chat row is missing or duplicated | SDK projection store plus renderer display handlers | `packages/windie-sdk-js/src/projections`, `packages/windie-sdk-js/src/runtime/Agent.ts`, chat stream handlers | SDK/main projection tests, `ChatStream*.test.ts` |
| Conversation list/search is wrong | Local-runtime memory plus dashboard renderer | `frontend/src/main/python/memory/conversation_*`, dashboard hooks | `tests/sidecar/test_conversation_*.py`, `tests/frontend/DashboardConversationLoad.test.js` |
| Replay displays wrong messages | SDK replay/display projection | `packages/windie-sdk-js/src/projections`, desktop conversation store adapter, replay hooks | SDK projection tests, rehydrate projection tests |
| Backend forgets prior transcript after reopen | SDK rehydrate projection plus backend rehydrate path | `packages/windie-sdk-js/src/projections`, `backend/src/api/handlers/rehydrate.py`, `backend/src/api/services/rehydrate_*` | `tests/backend/test_rehydrate_*.py`, SDK rehydrate tests |
| Tool-call/tool-output linkage breaks after replay | SDK tool projection plus backend rehydrate linkage validation | SDK tool projection files, `rehydrate_tool_call_normalization.py`, `rehydrate_tool_linkage.py` | SDK tool projection tests, backend rehydrate linkage tests |
| Semantic memory is stale or noisy | Local-runtime semanticization and backend semantic routes | `frontend/src/main/python/memory/conversation_semanticization_runtime.py`, `summarizer.py`, `backend/src/api/routes/memory/semantic` | `tests/sidecar/test_memory_summarizer.py`, `test_conversation_semanticization_runtime.py`, `tests/backend/test_memory_routes.py` |
| Embedding/search fails but transcript should still save | SDK embedding orchestration plus local-runtime memory store | `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`, `local_store.py`, `faiss_index.py` | SDK memory tests, `tests/sidecar/test_local_store_*.py` |
| Backend model context is too long or compaction output is wrong | Backend active history/compaction | `backend/src/agent/compaction`, `backend/src/agent/history`, executor/interaction loop | `tests/backend/test_history_compaction_engine.py`, `test_compaction_prompt.py`, `test_interaction_loop_compaction.py` |
| Memory RPC result is wrong | Local-runtime memory handlers and memory store | `frontend/src/main/python/local_backend_memory_handlers.py`, `frontend/src/main/python/memory/*` | `tests/sidecar/test_memory_*.py`, `tests/sidecar/test_memory_operations.py` |

## Layer Contracts

| Layer | Owns | Does not own |
| --- | --- | --- |
| Renderer transcript | Visible chat persistence, pending flushes, session ids, local replay payloads | Semantic summaries, vector indexes, backend model history |
| Local-runtime memory | SQLite transcript rows, episodic/semantic records, FAISS index, conversation list/search/title, semanticization | Backend active context window, prompt history mutation |
| Backend active history | Model-facing message history for active sessions, compaction, tool linkage during the loop | Durable local transcript storage or dashboard conversation listing |
| Backend memory routes | Embeddings, semantic summarize/title service endpoints, route health | Local-runtime DB schema, renderer replay state, or local-runtime orchestration |
| Dashboard UI | Listing/searching/deleting surfaced conversations and memories | Low-level storage schema, embedding provider behavior |

## Change Paths

### Change Session or Conversation Identity

Read:

- [Session and Conversation Identity Change Workflow](session_conversation_identity_change_workflow.md)
- [Sessions and Conversations](../concepts/sessions_and_conversations.md)
- [Session and Transcript Reference](../reference/session_and_transcript_reference.md)

Use this route for `user_id`, `session_id`, `conversation_ref`, `turn_ref`, transcript-session sync, active stream filtering, dashboard resume, stop-query routing, and wrong-conversation bugs before changing lower-level transcript or memory storage.

### Change Transcript Writes

Read:

- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md)
- [Transcript and Replay](transcript_and_replay.md)
- [Renderer Transcript Docs Hub](../frontend/renderer/transcript/README.md)
- [SDK Conversation Runtime](../sdk/conversation_runtime.md)

Likely code:

- `packages/windie-sdk-js/src/projections`
- `packages/windie-sdk-js/src/runtime/Agent.ts`
- desktop conversation store adapter
- chat stream handler code that renders SDK projections

Validation:

- transcript writer tests,
- pending queue/flush tests,
- chat stream event tests if writes happen during streaming.

### Change Replay or Rehydrate

Read:

- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md)
- [Transcript and Replay](transcript_and_replay.md)
- [Session and Transcript Reference](../reference/session_and_transcript_reference.md)
- [Backend History and Semantic Routes](backend_history_and_semantic_routes.md)

Likely code:

- `packages/windie-sdk-js/src/projections`
- desktop conversation store adapter
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts`
- `backend/src/api/handlers/rehydrate.py`
- `backend/src/api/services/rehydrate_*`

Validation:

- frontend replay and rehydrate payload tests,
- backend rehydrate execution, normalization, transparency, and linkage validation tests.

### Change Local-Runtime Durable Memory

Read:

- [Local Runtime Memory](sidecar_local_memory.md)
- [Local Runtime Memory Docs Hub](../frontend/sidecar/memory/README.md)
- [Memory Troubleshooting](memory_troubleshooting.md)

Likely code:

- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/memory/local_store.py`
- `sqlite_store.py`
- `operations.py`
- `conversation_*_runtime.py`
- SDK embedding orchestration and local-runtime remote semantic client

Validation:

- local-runtime store, operations, memory service, conversation search/list/title, semanticization, and remote client tests.

### Change Backend Compaction

Read:

- [Backend History and Semantic Routes](backend_history_and_semantic_routes.md)
- [Context and Memory](../concepts/context_and_memory.md)
- [Usage and Token Accounting](../concepts/usage_and_token_accounting.md)

Likely code:

- `backend/src/agent/compaction/engine.py`
- `backend/src/agent/compaction/prompt.py`
- `backend/src/agent/compaction/strategies/*`
- executor and interaction loop compaction call sites
- history admission/committer helpers

Validation:

- compaction prompt and engine tests,
- interaction-loop compaction tests,
- tool-result compaction facts tests.

## Identity Rules

| Identifier | Use |
| --- | --- |
| `userId` / `user_id` | Owner identity. Hosted backend should require authenticated identity where user-scoped work is performed, and request-body ids must match that identity. |
| `sessionId` / `session_id` | Runtime session identity; do not use as durable conversation identity when `conversationRef` exists. |
| `conversationRef` / `conversation_id` | Durable conversation/thread identity across transcript, replay, rehydrate, and local-runtime transcript storage. |
| `turn_ref` | Backend turn-scoped correlation for stream/tool events. |
| tool call ids/request ids | Preserve through transcript, replay, rehydrate, local execution, and backend tool-result history. |

Do not invent new identifiers inside UI components. Use the transcript/session runtime and existing conversation binding helpers.

## Failure Routing

| Failure | Avoid | Fix direction |
| --- | --- | --- |
| Missing dashboard row | Do not patch backend history | Check local-runtime transcript storage and dashboard query path. |
| Backend loses context after reopening | Do not rewrite the local-runtime SQLite store | Fix renderer rehydrate payload or backend rehydrate service. |
| Semantic fact is wrong | Do not edit raw transcript | Fix semanticization prompt/parser/source filtering or delete only derived semantic memory when intentional. |
| Tool output appears without tool call | Do not hide the UI row | Fix tool linkage preservation in transcript or rehydrate repair. |
| Embedding provider unavailable | Do not fail transcript writes | Keep durable writes non-fatal and surface search/semantic degradation. |

## Related Docs

- [Memory Hub](README.md)
- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md)
- [Transcript and Replay](transcript_and_replay.md)
- [Local Runtime Memory](sidecar_local_memory.md)
- [Backend History and Semantic Routes](backend_history_and_semantic_routes.md)
- [Memory Troubleshooting](memory_troubleshooting.md)
- [Code Change Surface Index](../reference/code_change_surface_index.md)
