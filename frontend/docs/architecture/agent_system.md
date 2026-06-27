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

Renderer-managed client settings are sent through the Agent SDK runtime as backend `update-settings` messages and applied to the user session before the next query.

Workspace prompt context:

- the session's active `workspace_path` is conversation-scoped prompt context
- prompt assembly may inject contextual `user` instruction blocks from applicable `AGENTS.md` files
- resolution starts at the active workspace and walks parent directories up to the enclosing repo root
- nested `AGENTS.md` files therefore layer from broad repo guidance to more specific subdirectory guidance

## Runtime Seams (2026-02-11)

Recent backend-agent refactors split mutable session/runtime concerns into focused modules:

- `backend/src/agent/session/session_registry.py` — `SessionRegistry` owns conversation-keyed active-session maps, latest-conversation tracking, and per-user locks.
- `backend/src/agent/session/session_config_service.py` — `SessionConfigService` owns user config overrides, client-supplied operating-system prompt rewrites, and effective session-config assembly.
- `backend/src/agent/session/active_query_tracker.py` — `ActiveQueryTracker` owns active query task registration/cancellation plus pending stop-query race guards.
- `backend/src/agent/session/runtime_state.py` — `SessionRuntimeState` owns screenshot state, resolved-call storage, tool-result storage, current `system_state`, and OCR completion signaling.
- `backend/src/agent/session/runtime_state.py` also tracks session-scoped background tasks for deterministic shutdown.
- `backend/src/agent/session/config_runtime.py` — `SessionConfigRuntime` applies live config updates (LLM client, prompt constructor, parser, and loop dependencies) in one place.
- `backend/src/agent/session/lifecycle.py` — `SessionLifecycle` centralizes best-effort cleanup for runtime stores and background tasks.
- `backend/src/agent/execution/interaction_loop.py` owns parse recovery, bundle-vs-single staging, and loop termination policy directly.

Tool preparation metadata now uses a typed execution reference:

- `backend/src/agent/tools/preparation/types/execution_ref.py` (`ExecutionRef`) to normalize `request_id`/`bundle_id` handling.
- Bundle detection and result processing now consume that shared type to reduce ad-hoc metadata branching.

## Tool Lifecycle (Backend)

The backend owns the preparation and result handling pipeline:

- **Preparation**: screenshot availability, OCR, coordinate resolution
- **Sending**: tool calls/bundles through SDK/main local-runtime dispatch
- **Waiting**: wait for tool results from SDK/main local-runtime dispatch
- **Processing**: transform tool outputs into history entries

`ToolPreparer` now exposes:

- `prepare(...) -> PreparationResult` as the canonical structured API
