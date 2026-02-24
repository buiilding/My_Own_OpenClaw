---
summary: "Backend query execution deep reference: query handler entrypoint, per-turn stream pipeline, agent executor loop sequencing, completion backfill rules, and active-task cancellation behavior."
read_when:
  - When changing query message handling, stream formatting/transport, or terminal event behavior.
  - When debugging missing completion events, duplicate chunks, query cancellation, or fallback final-response paths.
title: "Query Execution and Stream Pipeline Reference"
---

# Query Execution and Stream Pipeline Reference

## Canonical Modules

- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/tts/manager.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/agent/execution/executor.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/session/manager.py`

## WebSocket Query Entry

`QueryMessageHandler.handle_typed(...)` responsibilities:

1. register active query task for user (`SessionManager.register_active_query_task`) using `turn_ref=message.id`
2. delegate orchestration to `QueryExecutionService.execute(...)`
3. map validation and runtime exceptions to sanitized error responses
4. clear active task registration in `finally`

Active-task metadata used for cancellation path:

- `turn_ref`
- `conversation_ref`

`stop-query` handler cancels tracked task through `SessionManager.cancel_active_query_task(...)`.

## Query Execution Orchestration (`QueryExecutionService`)

Core sequence inside `execute(...)`:

1. validate query text
2. get/create `AgentSession`
3. apply backend-only runtime `system_state_internal` onto session state (best effort)
4. build immutable stream context (user/session/conversation/turn refs)
5. open `TTSSession` context
6. build `StreamPipeline(tts_processor, response_formatter, transport_sender)`
7. resolve screenshot source:
- inline `payload.screenshot`, or
- artifact fetch via `screenshot_ref`
8. iterate `agent_instance.process_query(...)`
9. process each event through pipeline with unified stream context

## Completion and Backfill Rules

The service tracks:

- `saw_terminal_event`
- `saw_text_chunk`
- accumulated `text_chunks`
- `last_assistant_full_text`

When `streaming-complete` arrives:

- compute completion text using precedence:
1. event final response
2. concatenated chunk text
3. assistant full text
4. deterministic fallback text
- if no prior text chunk but completion exists, emit synthetic chunk backfill before completion
- always emit terminal completion event through pipeline

If stream exits without terminal event:

- log warning
- emit fallback completion event sequence explicitly

## Stream Pipeline Contract (`StreamPipeline`)

Pipeline invariants:

- stateless by design for per-stream business state
- must be called serially per query (ordering guarantee)

Per-event stages:

1. format via `ResponseFormatter.format(...)`
2. transport send
3. async TTS processing (background task, failure-isolated)

TTS race handling:

- tracks pending TTS tasks
- `wait_for_pending_tts()` awaited before flush at query end
- prevents tail-chunk audio loss before EOS sentinel

## Formatter Dispatch Behavior (`ResponseFormatter`)

Formatter registry built from `api/contracts/formatter_specs.py`:

- typed event dispatch table (`event class -> formatter`)
- backward-compatible dict event dispatch table (`event type -> formatter`)
- duplicate registration guard on both tables

Context envelope fields (`user_id`, `session_id`, `conversation_ref`, `turn_ref`) are attached uniformly via `attach_context_fields(...)`.

## Agent Execution Path After API Layer

`AgentExecutor.process_query(...)`:

1. build final user content through prompt constructor
2. append user message to history
3. optional screenshot registration + OCR kickoff via screenshot manager
4. run `InteractionLoop.run_loop()` and yield events upstream
5. in finalization block:
- publish `InteractionCompleted` event
- emit/publish `MemoryStoreEvent` fallback even on generator closure

`InteractionLoop.run_loop()` governs:

- iteration limits
- prompt/tool schema retrieval per turn
- LLM stream handling and parsing
- tool/no-tool branching
- final completion emission
- hard-limit error completion

Tool path guarantees:

- stages tool-call IDs before execution
- ensures `process_results(...)` runs in `finally` for cleanup even after exceptions/disconnect
- bundle path waits for bundle completion before continuing loop

## Failure and Recovery Semantics

Query layer:

- validation failures produce `Invalid query` error envelope
- unexpected errors sanitized before client response
- task cancellation is logged and propagated

Pipeline layer:

- websocket send failures raise to stop stream
- TTS failures are logged but do not break text stream

Loop layer:

- LLM rate-limit and LLM runtime errors emit assistant error events and persist history marker
- max-iteration breach emits deterministic limit-reached error

## Debug Checklist

If frontend never receives terminal completion:

1. verify `streaming-complete` emitted by interaction loop
2. verify fallback completion path triggered when terminal event missing
3. inspect websocket send exceptions in pipeline stage 2

If text appears only at end:

1. verify chunk events are emitted/recognized (`chunk/content/streaming-response`)
2. verify formatter registration for chunk event types
3. inspect synthetic chunk backfill behavior (expected only when no chunks seen)

If stop-query does not cancel active run:

1. verify task was registered with matching user ID in query handler
2. verify cancel path sees non-done task in `_active_query_tasks`
3. verify `clear_active_query_task` not removing entry too early
