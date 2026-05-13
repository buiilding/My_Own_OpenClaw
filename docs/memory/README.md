---
summary: "Memory hub for WindieOS transcript persistence, conversation replay, sidecar local memory, semantic summarization, backend history, and rehydrate flow."
read_when:
  - When changing transcript persistence, conversation replay, memory search, semantic summarization, backend history, or rehydrate behavior.
  - When debugging missing chats, stale memory, title generation, semantic facts, or replay/tool linkage.
title: "Memory Hub"
---

# Memory Hub

WindieOS has several memory-like systems. They must not be treated as one store.

## Memory Layers

| Layer | Owner | Purpose |
| --- | --- | --- |
| Renderer transcript | `frontend/src/renderer/infrastructure/transcript` | Persist visible user, assistant, tool-call, and tool-output entries through Electron IPC. |
| Dashboard conversation views | `frontend/src/renderer/features/dashboard`, `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js` | List, search, group, and replay stored conversations. |
| Sidecar local memory | `frontend/src/main/python/memory`, `local_backend_memory_handlers.py` | Store transcript rows, episodic memories, semantic memories, conversation titles, and local search indexes. |
| Backend active history | `backend/src/agent/history`, `backend/src/agent/llm/conversation_context.py` | Maintain model-facing history and tool-call/tool-output linkage during active sessions. |
| Backend rehydrate/semantic routes | `backend/src/api/handlers/rehydrate.py`, `backend/src/api/services/rehydrate_*`, `backend/src/api/routes/memory` | Reconstruct transcripts for backend sessions and generate embeddings/summaries/titles. |

## Memory Pages

- [Transcript and Replay](transcript_and_replay.md) maps renderer transcript writes, pending queues, local snapshots, and replay/rehydrate payloads.
- [Sidecar Local Memory](sidecar_local_memory.md) maps JSON-RPC handlers, local store operations, semanticization, titles, and local search.
- [Backend History and Semantic Routes](backend_history_and_semantic_routes.md) maps active backend history, rehydrate services, embedding providers, and memory HTTP routes.
- [Memory Troubleshooting](memory_troubleshooting.md) maps missing chats, stale semantic memory, title issues, and replay linkage failures.

## Development Rules

- Visible transcript rows are not backend model history until rehydrate normalizes and sends them.
- Semantic memory is derived memory. Do not delete or rewrite it as a shortcut for fixing transcript display.
- Tool-call/tool-output linkage must preserve request ids, tool call ids, and structured payloads across transcript, rehydrate, and backend history.
- Local memory writes should be non-fatal when embeddings or remote semantic services are unavailable.
- Keep renderer, sidecar, and backend tests paired when a payload crosses process boundaries.

