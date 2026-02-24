---
summary: "Detailed backend runtime loop: AgentSession state, interaction loop, and full frontend-executed tool lifecycle."
read_when:
  - When changing tool execution behavior or agent loop iteration policy.
  - When debugging stuck tool waits, bundle handling, or session state leaks.
title: "Agent and Tool Runtime"
---

# Agent and Tool Runtime

## Core Runtime Object

Primary orchestrator:

- `agent/session/session.py:AgentSession`

Responsibilities:

- Owns session identity (`user_id`, `session_id`)
- Holds conversation history and runtime state (screenshot, system state, pending tool results)
- Delegates query processing to `AgentExecutor`
- Accepts frontend tool results (`tool-result` and `tool-bundle-result`)
- Tracks background tasks for deterministic cleanup

## Execution Stack

`AgentSession.process_query()` delegates to `AgentExecutor`, which composes:

- Conversation context builder
- LLM stream processor
- Tool preparation/sending/waiting/processing coordinators
- Event presenter for frontend stream events

Main control loop:

- `agent/execution/interaction_loop.py:InteractionLoop.run_loop()`

Loop stages:

1. Build prompt and tool schemas
2. Stream LLM output
3. Parse response into text + tool calls
4. If no tools: finalize assistant output and complete
5. If tools: execute lifecycle and continue iteration
6. Enforce iteration policy and final-turn rules

## Tool Lifecycle (Backend View)

### Phase 1: Preparation

- `agent/tools/preparation/preparer.py`
- Adds execution metadata (`request_id` or `bundle_id`)
- Resolves mouse coordinates via OCR or vision when required
- Produces immutable `ResolvedToolCall` instances

Coordinate pipeline modules:

- screenshot manager/coordinator
- OCR coordinator
- coordinate resolvers (OCR and vision variants)

### Phase 2: Sending

- `agent/tools/sending/sender.py`

Behavior:

- Single call -> emit `tool-call`
- Multi-call atomic bundle -> emit one `tool-bundle`
- Preparation failures -> emit synthetic tool-call/tool-output failure and store pending result

### Phase 3: Waiting

- `tools/orchestrator.py:ToolResultOrchestrator`

Behavior:

- Waits on frontend-completed result futures
- Bundle path waits on single bundle future
- Single path waits per request id
- Applies tool policy filtered capability surface for metadata listing

### Phase 4: Processing

- `agent/tools/processing/*`

Behavior:

- Transforms frontend tool outputs into history-ready representations
- Commits results to conversation history for next LLM turn context

## Tool Result Ingress from Frontend

Flow:

1. `api/handlers/tool_result.py` receives typed payload
2. Delegates to session methods
3. `agent/tools/waiting/handler.py` receiver normalizes payload
4. Router stores pending result and resolves relevant futures
5. Screenshot/system state updates are captured for runtime context

## Tool Result Storage Contract

Central store:

- `agent/tools/waiting/storage/result_storage.py:ToolResultStorage`

Stores:

- pending individual results
- per-request futures
- bundle results
- per-bundle futures
- TTL timestamps for cleanup

Key behavior:

- loop-aware future creation for sync/async contexts
- result-first or future-first resolution both supported
- stale entries cleaned to reduce long-session memory growth

## Bundle Semantics

Atomic bundle behavior:

- LLM tool calls sharing bundle metadata are dispatched once as `tool-bundle`
- Backend waits for one `tool-bundle-result`
- Bundle step results are transformed and committed as a grouped output narrative
- Preparation-time bundle failures are converted to synthetic failed bundle result to unblock loop

## Session Safety and Cancellation

- Session manager tracks active query task per user.
- `stop-query` cancels active task and clears tracking.
- Tool execution cleanup in interaction loop `finally` prevents stale request/future state leaks.
- WebSocket disconnect triggers task manager cleanup + session end.
