---
summary: "Local backend JSON-RPC reference for SDK daemon-backed sidecar calls: request envelope, registered methods, removed search_memory text-query RPC behavior, bridge mapping, and timeout/error semantics."
read_when:
  - When adding/changing sidecar JSON-RPC methods or bridge payload mappers.
  - When debugging execute_tool, removed search-memory text-query calls, embedding-backed memory search, or chat-event persistence failures between Electron and Python sidecar.
title: "Local Backend JSON-RPC Reference"
---

# Local Backend JSON-RPC Reference

Electron bridge helpers use the SDK local runtime provider. The SDK sends
JSON-RPC envelopes to the sidecar daemon `/rpc` endpoint, and the daemon
dispatches them through `LocalBackend.protocol.handle_request(...)`.

## Core Modules

- Electron bridge: `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- IPC->method mappers: `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`
- Sidecar daemon: `frontend/src/main/python/sidecar_daemon.py`
- LocalBackend implementation: `frontend/src/main/python/local_backend.py`
- Sidecar memory handler mixin: `frontend/src/main/python/local_backend_memory_handlers.py`
- JSON-RPC protocol implementation: `frontend/src/main/python/core/ipc_protocol.py`

## Transport Model

Electron main computes desktop launch options, but the SDK starts or reuses
`sidecar_daemon.py`. The daemon owns one `LocalBackend` instance, including local
memory, chat-event storage, embeddings, FAISS indices, and tool execution. SDK
runtime calls send JSON-RPC envelopes to the daemon `POST /rpc` endpoint.

Request envelope:

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "<method_name>",
  "params": {}
}
```

Response envelope:

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "result": {}
}
```

## Registered Methods

Core/tool methods:

- `ping`
- `get_status`
- `execute_tool`
- `get_system_state`
- `install_browser_chromium`
- `determine_macos_system_events_automation_permission`

Memory methods:

- `search_memory_by_embedding`
- `store_memory_by_embedding`
- `list_episodic_memories`
- `list_semantic_memories`
- `delete_episodic_memory`
- `delete_semantic_memory`
- `clear_local_memory`
- `clear_chat_history`

Chat-event methods:

- `store_chat_event`
- `replace_chat_conversation`
- `rewrite_chat_conversation_after_event`
- `list_chat_conversations`
- `search_chat_conversations`
- `get_chat_events`
- `get_chat_conversation_revision`
- `delete_chat_conversation`

The legacy transcript-row conversation methods are not registered.

## Main Bridge to JSON-RPC Mapping

Direct bridge handlers:

- scoped host channels and `executeToolForBackend(...)` -> `execute_tool`
- `get-system-state` -> `get_system_state`

Mapped bridge handlers:

- `store-chat-event` -> `store_chat_event`
- `list-chat-conversations` -> `list_chat_conversations`
- `search-chat-conversations` -> `search_chat_conversations`
- `get-chat-events` -> `get_chat_events`
- `delete-chat-conversation` -> `delete_chat_conversation`
- `list-episodic-memories` -> `list_episodic_memories`
- `list-semantic-memories` -> `list_semantic_memories`
- `delete-episodic-memory` -> `delete_episodic_memory`
- `delete-semantic-memory` -> `delete_semantic_memory`
- `clear-local-memory` -> `clear_local_memory`
- `clear-chat-history` -> `clear_chat_history`
- `replace-chat-conversation` -> `replace_chat_conversation`
- `rewrite-chat-conversation-after-event` -> `rewrite_chat_conversation_after_event`
- `get-chat-conversation-revision` -> `get_chat_conversation_revision`

Removed direct memory-search bridge:

- `search-memory` is no longer registered by Electron main.
- `search_memory` is no longer registered by `LocalBackend`.
- text-query memory search does not run in the sidecar.
- prompt memory retrieval must use SDK-provided embeddings and
  `search_memory_by_embedding`.

## Memory and Chat Semantics

`conversation_events` is the durable chat log. It stores visible user,
assistant, tool-call, tool-output, compaction, metadata, and attachment events.
Conversation listing/search/replay reads from this table.

`conversation_revisions` stores the current SDK conversation revision for
sidecar-backed conversations. `replace_chat_conversation` updates it atomically
with the replacement event rows, and `get_chat_conversation_revision` reads it
before falling back to the latest event revision. This keeps edit/resend and
retry rewrites from reporting an old preserved event revision.

`store_memory_by_embedding` writes SDK-formatted interaction memory rows with `record_kind='interaction'` and a caller-provided embedding. Those rows power Episodic Memory and semantic summarization. They are not the visible chat replay source. The sidecar does not call backend embeddings for memory writes.

`search_memory_by_embedding` queries episodic and semantic memory for prompt injection using an SDK-provided embedding. The sidecar does not expose a text-query memory search RPC and does not generate embeddings for memory retrieval. This path does not reconstruct chat replay from chat events.

## Failure Handling

- invalid method or params return JSON-RPC errors
- memory handlers return `{ success:false, error:"Memory store not initialized" }` when the memory runtime is unavailable
- bridge timeouts are owned by `local_backend_bridge_timeout_policy.cjs`
- mapped responses are forwarded to renderer unchanged
