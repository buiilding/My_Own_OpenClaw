---
summary: "Agent System"
read_when:
  - When updating agent protocols or tool execution flow.
  - When refactoring session runtime state, tool preparation metadata, or interaction-loop policies.
---

# Agent System

## Overview

The agent system orchestrates each user session: it builds prompts, streams LLM output, prepares tool calls, and commits results to history. The implementation lives under `backend/src/agent/`.

Key entry points:

- `backend/src/agent/session/session.py` — `AgentSession`
- `backend/src/agent/session/manager.py` — `SessionManager`
- `backend/src/agent/execution/executor.py` — `AgentExecutor`
- `backend/src/agent/execution/interaction_loop.py` — `InteractionLoop`

## Core Responsibilities

- **Session management**: create/reuse sessions per `user_id`, apply session config updates.
- **Prompt assembly**: build messages + system context, pass tool schemas via native LLM tool params (also emitted as a transparency event).
- **LLM streaming**: stream tokens and transform into events.
- **Tool lifecycle**: prepare → send → wait → process results.
- **History**: append assistant/tool outputs to conversation history.

## Flow (High-Level)

1. **Query received** (`api/handlers/query.py`)
2. **Session resolved** (`SessionManager.get_or_create_session`)
3. **Interaction loop** (`InteractionLoop.run_loop`)
4. **LLM stream** (`LLMStreamProcessor`)
5. **Tool orchestration** (agent `ToolOrchestrator` + `ToolResultOrchestrator`)
6. **Results processed** (`ToolProcessingCoordinator`)
7. **History committed** (`HistoryCommitter`)

## Session Config Updates

Frontend settings are sent via `update-settings` and applied to the user session before the next query.

## Runtime Seams (2026-02-11)

Recent backend-agent refactors split mutable session/runtime concerns into focused modules:

- `backend/src/agent/session/runtime_state.py` — `SessionRuntimeState` owns screenshot state, resolved-call storage, tool-result storage, current `system_state`, and OCR completion signaling.
- `backend/src/agent/session/runtime_state.py` also tracks session-scoped background tasks for deterministic shutdown.
- `backend/src/agent/session/config_runtime.py` — `SessionConfigRuntime` applies live config updates (LLM client, prompt constructor, parser, and loop dependencies) in one place.
- `backend/src/agent/session/lifecycle.py` — `SessionLifecycle` centralizes best-effort cleanup for runtime stores and legacy futures.

Interaction-loop control policies were also extracted from `InteractionLoop`:

- `backend/src/agent/execution/policies.py`:
  - `IterationPolicy` (max-iteration and extra-turn behavior)
  - `ParseRecoveryPolicy` (parser-error corrective messaging)
  - `ToolExecutionPolicy` (bundle-vs-single decision)

Tool preparation metadata now uses a typed execution reference:

- `backend/src/agent/tools/preparation/types/execution_ref.py` (`ExecutionRef`) to normalize `request_id`/`bundle_id` handling.
- Bundle detection and result processing now consume that shared type to reduce ad-hoc metadata branching.

## Tool Lifecycle (Backend)

The backend owns the preparation and result handling pipeline:

- **Preparation**: screenshot availability, OCR, coordinate resolution
- **Sending**: tool calls/bundles to the frontend
- **Waiting**: wait for tool results from the sidecar
- **Processing**: transform tool outputs into history entries

`ToolPreparer` now exposes:

- `prepare(...) -> PreparationResult` as the canonical structured API

See `backend/src/agent/folder_stucture.md` for a full module map.
