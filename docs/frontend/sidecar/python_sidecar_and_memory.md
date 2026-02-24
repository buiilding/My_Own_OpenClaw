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
- `memory_service.py`: minimal memory-only service variant
- `wakeword_service.py`: binary-protocol wakeword inference service

## Local Backend Protocol

`local_backend.py` uses `core/ipc_protocol.py:JSONRPCProtocol` over stdin/stdout.

Registered methods include:

- `execute_tool`
- `get_system_state`
- memory APIs (`search_memory`, `store_memory`, list/get/delete conversation and semantic records)
- health methods (`ping`, `get_status`)

Operational behavior:

- initializes memory store + optional summarizer at startup
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

This schema layer is the primary runtime guard before tool execution.

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
