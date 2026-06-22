---
summary: "Local-runtime JSON-RPC reference for SDK daemon-backed local-runtime calls: request envelope, registered methods, removed direct chat/memory IPC mappings, and timeout/error semantics."
read_when:
  - When adding/changing local-runtime JSON-RPC methods or SDK local-runtime callers.
  - When debugging execute_tool, removed search-memory text-query calls, embedding-backed memory search, or chat-event persistence failures between Electron and local-runtime Python.
title: "Local Runtime JSON-RPC Reference"
---

# Local Runtime JSON-RPC Reference

Electron bridge helpers use the SDK local runtime provider. The SDK sends
JSON-RPC envelopes to the local-runtime daemon `/rpc` endpoint, and the daemon
dispatches them through `LocalRuntimeService.protocol.handle_request(...)`.

## Core Modules

- Electron bridge: `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- Local-runtime daemon: `frontend/src/main/python/sidecar_daemon.py`
- LocalRuntimeService implementation: `frontend/src/main/python/local_backend.py`
- Local-runtime memory handler mixin: `frontend/src/main/python/local_backend_memory_handlers.py`
- JSON-RPC protocol implementation: `frontend/src/main/python/core/ipc_protocol.py`

## Transport Model

Electron main computes desktop launch options, but the SDK starts or reuses
`sidecar_daemon.py`. The daemon owns one `LocalRuntimeService` instance, including local
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

- `conversation.append_event`
- `conversation.list`
- `conversation.search`
- `conversation.load_events`
- `conversation.get_revision`
- `conversation.delete`
- `conversation.display.replace`
- `conversation.display.load`
- `conversation.model_history.replace`
- `conversation.model_history.load`

Legacy transcript-row conversation methods and retired direct chat-history
method names are not registered.

## Main Bridge to JSON-RPC Mapping

Direct bridge handlers:

- scoped host channels and `executeToolForBackend(...)` -> `execute_tool`
- `get-system-state` -> `get_system_state`

Removed direct chat/memory IPC mappings:

- Electron main no longer registers direct `store-chat-event`,
  `list-chat-conversations`, `search-chat-conversations`,
  `get-chat-events`, `delete-chat-conversation`,
  `list-episodic-memories`, `list-semantic-memories`,
  `delete-episodic-memory`, `delete-semantic-memory`,
  `clear-local-memory`, `clear-chat-history`,
  `replace-chat-conversation`, `rewrite-chat-conversation-after-event`, or
  `get-chat-conversation-revision` IPC handlers.
- Renderer-visible chat and memory actions use SDK-shaped
  `window.agentSdk.invoke(...)` commands. The SDK local runtime store calls
  local-runtime JSON-RPC methods behind that public command boundary.
- The deleted mapper module must not be reintroduced for compatibility aliases;
  add a typed SDK command or a main-only helper at the owning boundary instead.

Removed direct memory-search bridge:

- `search-memory` is no longer registered by Electron main.
- `search_memory` is no longer registered by `LocalRuntimeService`.
- text-query memory search does not run in the sidecar.
- prompt memory retrieval must use SDK-provided embeddings and
  `search_memory_by_embedding`.

## Memory and Chat Semantics

`conversation_events` is the durable chat log. It stores visible user,
assistant, tool-call, tool-output, compaction, metadata, and attachment events.
Conversation listing/search/replay reads from this table. Normal SDK
conversation flow appends to this table and does not rewrite it.

`conversation_revisions` stores the current SDK conversation revision for
local-runtime-backed conversations. Display timeline and model-history
checkpoint writes advance revision metadata, and `conversation.get_revision`
reads it before falling back to the latest event revision.

`store_memory_by_embedding` writes SDK-formatted interaction memory rows with `record_kind='interaction'` and a caller-provided embedding. Those rows power Episodic Memory and semantic summarization. They are not the visible chat replay source. The sidecar does not call backend embeddings for memory writes.

`search_memory_by_embedding` queries episodic and semantic memory for prompt injection using an SDK-provided embedding. The sidecar does not expose a text-query memory search RPC and does not generate embeddings for memory retrieval. This path does not reconstruct chat replay from chat events.

## Failure Handling

- invalid method or params return JSON-RPC errors
- memory handlers return `{ success:false, error:"Memory store not initialized" }` when the memory runtime is unavailable
- bridge timeouts are owned by `local_runtime_timeout_policy.cjs`
- SDK local-runtime responses are normalized by their SDK/main owner before
  crossing renderer-facing command boundaries
