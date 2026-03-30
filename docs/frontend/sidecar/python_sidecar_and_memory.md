---
summary: "Python sidecar runtime architecture: JSON-RPC local backend, tool registry, memory stores, semantic consolidation, and wakeword service."
read_when:
  - When changing sidecar tools, memory persistence/search, or subprocess protocol behavior.
  - When debugging sidecar readiness, request correlation, or memory summarization cadence.
title: "Python Sidecar and Memory"
---

# Python Sidecar and Memory

## Sidecar Services

Primary Python entrypoints under `frontend/src/main/python`:

- `local_backend.py`: JSON-RPC sidecar runtime used for tool execution, system state, and memory APIs
- `local_backend_memory_handlers.py`: extracted memory-search/store/transcript/delete RPC handlers used by `LocalBackend`
- `memory_service.py`: minimal memory-only service variant
- `wakeword_service.py`: binary-protocol wakeword inference service

## Local Backend Protocol

`local_backend.py` uses `core/ipc_protocol.py:JSONRPCProtocol` over stdin/stdout.
Memory-focused RPC methods are implemented in `local_backend_memory_handlers.py` and mixed into `LocalBackend`.

Registered methods include:

- `execute_tool`
- `get_system_state`
- memory APIs (`search_memory`, `store_memory`, list/get/delete conversation and semantic records)
- health methods (`ping`, `get_status`)

Operational behavior:

- initializes memory store + optional summarizer at startup
- semantic summarizer can be disabled for dev runs with `WINDIE_ENABLE_SEMANTIC_SUMMARIZER=0`
- keeps single in-process tool registry instance
- returns structured success/error responses for each RPC method

## Sidecar Tool Registry

Module:

- `tools/registry.py`

Tool families:

- computer tools: mouse, keyboard, screenshot, scroll
- filesystem tools: read/replace
- system tools: shell/process/window/stats/wait
- browser tool: browser automation adapter

Registry behavior:

- normalizes legacy dict results into canonical `ToolResult`
- warns when backend-exposed tool names are missing in sidecar runtime
- handles sync and async tool implementations

## Sidecar Tool Schemas

Module:

- `tools/schemas.py`

Defines Pydantic argument models and validation for:

- mouse/keyboard/screenshot/scroll contracts
- shell/process contracts
- filesystem and window/system utility contracts

Current enforcement boundary:

- schema models define canonical argument contracts shared by sidecar tooling/tests
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
- uses remote embedding client (`core/remote_embedding_client.py`) against backend embeddings API
- optionally consolidates episodic memories into semantic summaries using backend semantic summarization endpoint

Memory deep references:

- [Sidecar Memory Docs Hub](memory/README.md)
- [Sidecar Memory Storage Docs Hub](memory/storage/README.md)
- [Summarizer Watermark and Conversation Batch Reference](memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](memory/storage/conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
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

- [Sidecar Core Docs Hub](core/README.md)
- [Sidecar Services Docs Hub](services/README.md)
- [Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference](core/backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md)
- [JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference](core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Memory Service JSON Protocol and Store Lifecycle Reference](services/memory_service_json_protocol_and_store_lifecycle_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](services/wakeword_service_model_bootstrap_and_binary_framing_reference.md)
