---
summary: "Memory hub for transcript persistence, conversation replay, local-runtime memory, semantic summarization, backend history, and rehydrate flow."
read_when:
  - When changing transcript persistence, conversation replay, memory search, semantic summarization, backend history, or rehydrate behavior.
  - When debugging missing chats, stale memory, title generation, semantic facts, or replay/tool linkage.
title: "Memory Hub"
---

# Memory Hub

The desktop UI, local-runtime memory store, and hosted backend have several
memory-like systems. They must not be treated as one store.

## Memory Layers

| Layer | Owner | Purpose |
| --- | --- | --- |
| Renderer transcript | `frontend/src/renderer/infrastructure/transcript` | Persist visible user, assistant, tool-call, and tool-output entries through Electron IPC. |
| Dashboard conversation views | `frontend/src/renderer/features/dashboard`, `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js` | List, search, group, and replay stored conversations. |
| Local-runtime memory | `frontend/src/main/python/memory`, `local_backend_memory_handlers.py` | Store transcript rows, episodic memories, semantic memories, conversation titles, and local search indexes. |
| Backend active history | `backend/src/agent/history`, `backend/src/agent/llm/conversation_context.py` | Maintain model-facing history and tool-call/tool-output linkage during active sessions. |
| Backend rehydrate/semantic routes | `backend/src/api/handlers/rehydrate.py`, `backend/src/api/services/rehydrate_*`, `backend/src/api/routes/memory` | Install model-history checkpoints for backend sessions and generate embeddings/summaries/titles. |

## Memory Pages

- [Memory Change Workflow](memory_change_workflow.md) routes transcript, replay, local-runtime durable memory, semanticization, backend history, and compaction changes to the right owner.
- [Session and Conversation Identity Change Workflow](session_conversation_identity_change_workflow.md) routes `user_id`, `session_id`, `conversation_ref`, `turn_ref`, transcript sync, replay, rehydrate, stream filtering, and wrong-conversation bugs.
- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md) routes transcript writes, pending queues, local-runtime transcript storage, dashboard replay/resume, model-history rehydrate payloads, tool-row reconstruction, and validation.
- [Storage and Persistence Change Workflow](../architecture/storage_persistence_change_workflow.md) routes storage shape, migration, reset, durability, SQLite/FAISS, artifact, config, and in-memory-state changes.
- [Transcript and Replay](transcript_and_replay.md) maps renderer transcript writes, pending queues, local snapshots, replay, and model-history resume payloads.
- [Local Runtime Memory](sidecar_local_memory.md) maps JSON-RPC handlers, local store operations, semanticization, titles, and local search.
- [Backend History and Semantic Routes](backend_history_and_semantic_routes.md) maps active backend history, rehydrate services, embedding providers, and memory HTTP routes.
- [Memory Troubleshooting](memory_troubleshooting.md) maps missing chats, stale semantic memory, title issues, and replay linkage failures.

## Development Rules

- Visible transcript rows are not backend model history until rehydrate normalizes and sends them.
- Semantic memory is derived memory. Do not delete or rewrite it as a shortcut for fixing transcript display.
- Tool-call/tool-output linkage must preserve request ids, tool call ids, and structured payloads across transcript, rehydrate, and backend history.
- Local memory writes should be non-fatal when embeddings or remote semantic services are unavailable.
- Keep renderer, local-runtime, and backend tests paired when a payload crosses process boundaries.
