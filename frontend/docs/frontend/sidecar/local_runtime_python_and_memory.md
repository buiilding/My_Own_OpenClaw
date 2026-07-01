---
summary: "Local-runtime Python implementation behind the local-runtime boundary: JSON-RPC service, tool registry, memory stores, semantic consolidation, and wakeword service."
read_when:
  - When changing local-runtime tools backed by local-runtime Python implementation, local-runtime memory persistence/search, or subprocess protocol behavior.
  - When debugging local-runtime Python readiness, request correlation, or memory summarization cadence.
title: "Local-Runtime Python and Memory"
---

# Local-Runtime Python and Memory

## Local-Runtime Python Services

Primary Python entrypoints under `frontend/src/main/python`:

- `sidecar_daemon.py`: canonical local-runtime Python daemon; owns the app-session `LocalRuntimeService`, tool registry, memory store, and daemon HTTP/WebSocket surface
- `local_backend.py`: internal `LocalRuntimeService` implementation used by the daemon for JSON-RPC method dispatch, tools, memory, and transcript handlers
- `local_backend_memory_handlers.py`: extracted memory-search/store/transcript/delete RPC handlers used by `LocalRuntimeService`
- `wakeword_service.py`: binary-protocol wakeword inference service

Only one process may own `LocalMemoryStore` for a running app session. The
daemon is that owner for desktop. Electron must not start standalone
`local_backend.py` beside it, because that can race SQLite writes and corrupt
FAISS/SQLite mapping assumptions.

## Local Runtime Protocol

`LocalRuntimeService` uses `core/ipc_protocol.py:JSONRPCProtocol`.
Memory-focused RPC methods are implemented in `local_backend_memory_handlers.py` and mixed into `LocalRuntimeService`.

Transport path:

- Electron helper calls go through the SDK local runtime provider.
- The SDK calls `sidecar_daemon.py` `POST /rpc`, which dispatches to
  `LocalRuntimeService.protocol.handle_request(...)`.

Registered methods include:

- `execute_tool`
- `get_system_state`
- memory APIs (`search_memory_by_embedding`, `store_memory_by_embedding`, list/get/delete conversation and semantic records)
- health methods (`ping`, `get_status`)

Operational behavior:

- initializes memory store + optional summarizer at startup
- semantic summarizer can be disabled for dev runs with
  `AGENT_ENABLE_SEMANTIC_SUMMARIZER=0`; WindieOS Electron launches also accept
  `WINDIE_ENABLE_SEMANTIC_SUMMARIZER=0` through the host skin alias
- keeps single in-process tool registry instance
- returns structured success/error responses for each RPC method

## Local-Runtime Tool Registry

Module:

- `tools/registry.py`

Tool families:

- computer tools: mouse, keyboard, screenshot, scroll
- filesystem tools: read/replace
- system tools: shell/process/window/stats/wait
- browser tool: browser automation adapter

Registry behavior:

- requires executable tools to return canonical `ToolResult`
- warns when backend-exposed tool names are missing in local-runtime execution
- handles sync and async tool implementations

## Local-Runtime Tool Schemas

Module:

- `tools/schemas.py`

Defines Pydantic argument models and validation for:

- mouse/keyboard/screenshot/scroll contracts
- shell/process contracts
- filesystem and window/system utility contracts

Current enforcement boundary:

- schema models define canonical argument contracts shared by local-runtime Python tooling/tests
- `ToolRegistry.execute_tool(...)` does not automatically instantiate all schema models before invocation
- runtime guardrails are split between:
  - direct tool-name routing and caller-arg cloning in `tools/registry.py`
  - concrete tool runtime checks inside tool modules
  - backend pre-dispatch validation for model-emitted args in backend tool-preparation path

Tool-specific deep references:

- [Shell and Process Session Runtime Reference](tools/shell_and_process_session_runtime_reference.md)
- [Filesystem Read and Replace Runtime Reference](tools/filesystem_read_replace_runtime_reference.md)

## Memory Storage Stack

Key modules:

- `memory/local_store.py`
- `memory/sqlite_store.py`
- `memory/faiss_index.py`
- `memory/operations.py`
- `memory/summarizer.py`

Behavior:

- stores episodic + semantic memory records with vector search support
- accepts SDK-provided embeddings for memory writes and searches; the sidecar does not call backend embeddings
- optionally consolidates episodic memories into semantic summaries using backend semantic summarization endpoint

Memory deep references:

- [Local Runtime Memory Docs Hub](memory/README.md)
- [Local Runtime Memory Storage Docs Hub](memory/storage/README.md)
- [Summarizer Watermark and Conversation Batch Reference](memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)

## System State and Platform Adapters

System context capture:

- `core/system_state.py`

Includes:

- active window
- mouse position
- screen resolution
- open windows
- system stats

Platform-specific abstractions:

- `core/platform/windows.py`
- `core/platform/macos.py`
- `core/platform/linux.py`

Deep reference:

- [System-State Collection and Platform Adapter Reference](system_state/system_state_collection_and_platform_adapter_reference.md)

## Wakeword Service Boundary

Wakeword runtime remains a dedicated subprocess due binary audio framing and streaming constraints.

Main process bridge responsibilities:

- process lifecycle management
- binary chunk framing
- readiness and detection signaling
- error propagation to renderer status surfaces

## Related Pages

- [Local-Runtime Core Docs Hub](core/README.md)
- [Local-Runtime Services Docs Hub](services/README.md)
- [Backend Config Env-Precedence Reference](core/backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md)
- [Remote Semantic Client Reference](core/remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md)
- [JSON-RPC Protocol and Stdout Framing Reference](core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](services/wakeword_service_model_bootstrap_and_binary_framing_reference.md)
