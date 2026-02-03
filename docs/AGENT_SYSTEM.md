---
summary: "Agent System"
read_when:
  - When updating agent protocols or tool execution flow.
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

- **Session management**: create/reuse sessions per `user_id`, apply query config overrides.
- **Prompt assembly**: build messages + system context, embed tool schemas in the initial user message (also emitted as a transparency event).
- **LLM streaming**: stream tokens and transform into events.
- **Tool lifecycle**: prepare → send → wait → process results.
- **History**: append assistant/tool outputs to conversation history.

## Flow (High-Level)

1. **Query received** (`api/handlers/query.py`)
2. **Session resolved** (`SessionManager.get_or_create_session`)
3. **Interaction loop** (`InteractionLoop.run_loop`)
4. **LLM stream** (`LLMStreamProcessor`)
5. **Tool orchestration** (`ToolOrchestrator`)
6. **Results processed** (`ToolProcessingCoordinator`)
7. **History committed** (`HistoryCommitter`)

## Query Config Overrides

Each `query` payload can include a `config` object (model selection, voice toggles). The session manager applies these overrides to the per-session `AppConfig` before running the agent.

## Tool Lifecycle (Backend)

The backend owns the preparation and result handling pipeline:

- **Preparation**: screenshot availability, OCR, coordinate resolution
- **Sending**: tool calls/bundles to the frontend
- **Waiting**: wait for tool results from the sidecar
- **Processing**: transform tool outputs into history entries

See `backend/src/agent/folder_stucture.md` for a full module map.
