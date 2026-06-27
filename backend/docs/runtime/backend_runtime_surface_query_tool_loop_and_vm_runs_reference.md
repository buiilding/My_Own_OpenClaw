---
summary: "Backend runtime surface reference for FastAPI assembly, query execution helpers, tool-loop orchestration, OpenAI Responses-native reasoning path, and VM run-control routes."
read_when:
  - When updating backend runtime flow across API ingress, agent loop execution, and tool-result return paths.
  - When changing hosted VM worker integration (`/api/runs/*`) or OpenAI native reasoning runtime behavior.
title: "Backend Runtime Surface: Query, Tool Loop, and VM Runs"
---

# Backend Runtime Surface: Query, Tool Loop, and VM Runs

## Scope

Canonical files:

- `backend/src/main.py`
- `backend/src/api/app_assembly.py`
- `backend/src/api/routes/__init__.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_execution_support/*`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/tools/orchestrator.py`
- `backend/src/llm/providers/openai.py`
- `backend/src/llm/providers/openai_responses_runtime.py`
- `backend/src/api/routes/runs/*`
- `backend/src/services/vm_run_control.py`

## App Assembly and Route Surface

`create_api_app(...)` in `api/app_assembly.py` is the shared assembly path for backend and simulation-like entrypoints:

- creates FastAPI app with explicit lifespan handler
- applies default CORS (`http://localhost:5173` unless overridden)
- registers all routers from `api/routes/__init__.py`

`API_ROUTERS` currently includes:

1. `auth_router` from `backend.src.api.auth.router`
2. `websocket_router` from `backend.src.api.routes.websocket.router`
3. `transcription_router` from `backend.src.api.routes.transcription.router`
4. `runs_router` from `backend.src.api.routes.runs.router`
5. `artifacts_router` from `backend.src.api.routes.artifacts.router`
6. `sdk_router` from `backend.src.api.routes.sdk.router`
7. `embeddings_router` from `backend.src.api.routes.memory.embeddings.router`
8. `semantic_router` from `backend.src.api.routes.memory.semantic.router`

This means install auth, websocket query streaming, transcription, VM
run-control, artifacts, hosted SDK developer routes, and memory routes are all
part of the same canonical backend app registration path.

## Query Execution Runtime Split

`QueryExecutionService.execute(...)` is now intentionally thin and delegates runtime details to helper modules under `api/services/query_execution_support/`:

- `query_execution_inputs.py`: normalizes `process_query(...)` inputs (`image_data`, `image_refs`, `capture_meta`, `message_content`, `conversation_ref`)
- `query_execution_runtime.py`: extracts and applies backend-only runtime system state and builds immutable stream context
- `query_execution_pipeline_events.py`: centralizes event->pipeline emission behavior
- `query_execution_stream_state.py`: stores terminal/chunk/full-text stream state
- `query_execution_completion.py`: single completion/backfill path for both normal terminal events and fallback completion
- `query_execution_cancellation.py`: resolves pending tool calls on cancellation

Important behavior contracts:

- screenshot inputs are artifact-backed: `screenshot_refs` wins over single `screenshot_ref`
- artifact loads are best-effort and downgrade to no-image when refs fail to resolve
- `system_state_internal` is runtime-only; it is merged onto session state but not injected directly as model-facing query text
- missing terminal event causes deterministic fallback completion emission (same completion helper path as normal terminal flow)
- events after a terminal stream event are ignored by `QueryExecutionService`

## Agent Loop and Tool Turn Contract

`InteractionLoop.run_loop()` owns turn-level control flow:

1. optional mid-loop compaction (`auto-mid`) with start/completed/failed events
2. prompt/tool schema retrieval via conversation context
3. LLM streaming via `LLMStreamProcessor`
4. parse-to-response conversion and assistant text emission
5. no-tool path -> final assistant history row + completion
6. tool path -> assistant row with tool calls + tool orchestrator send/wait/process cycle

Recoverable model tool-call parse failures:

- streamed errors are inspected with `is_recoverable_llm_tool_call_error(...)`
- on recoverable error, backend emits synthetic tool output and continues loop
- non-recoverable stream errors are sanitized and terminate the loop

Tool lifecycle split:

- send: `agent/tools/sending/sender.py`
- wait: `tools/orchestrator.py` (bundle-aware wait over result futures)
- process: `agent/tools/processing/coordinator.py` via `agent/tools/orchestrator.py`

## OpenAI Native Reasoning Runtime Path

`OpenAIProvider` (`llm/providers/openai.py`) chooses runtime mode per model:

- standard chat-completions path -> inherited `OnlineLLMProvider` behavior
- native reasoning path -> `openai_responses_runtime.py`

Native reasoning mode behavior:

- requests use `litellm.aresponses(...)` instead of chat-completions
- streamed reasoning deltas (`response.reasoning_*`) are mapped to `ThinkingEvent`
- streamed output text deltas are mapped to `ChunkEvent`
- `response.completed` event is required to extract final normalized payload
- stream without final completed payload fails closed with `LLMAPIError`
- final normalized payload may also carry `response_id`, which is later reused for `previous_response_id` continuation turns

OpenAI Responses continuation behavior:

- OpenAI Responses can be selected for reasoning turns and for native `web_search` turns
- desktop tools continue to run through the shared direct-function tool path
- follow-up Responses turns replay only the trailing tool outputs through `previous_response_id` as standard function-tool outputs

This path is gated by provider/model reasoning preference resolution (`resolve_provider_thinking_preference(...)`).

## Hosted VM Run-Control Route Surface

`/api/runs/*` routes in `api/routes/runs/router.py` expose worker-driven run orchestration:

- create run
- get run
- list/append run events
- run control actions
- stop-all per workspace
- worker dispatched ack
- worker heartbeat / worker poll heartbeat

Support/runtime contracts:

- API key enforcement: `x-windie-runs-key` must match `WINDIE_RUNS_API_KEY`; routes fail closed with `503` when the key is not configured
- service instance is app-state scoped (`request.app.state.vm_run_control_service`)
- active run limit per workspace is env-configurable (`WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`, default `1`)

`VmRunControlService` is in-memory and lock-guarded:

- tracks run registry, worker registry, per-workspace queue
- applies stream/control/heartbeat transitions through support helpers
- records sequenced run events for worker/dashboard polling

## Why This Split Matters

The runtime is now partitioned so changes can be localized:

- API ingress behavior can evolve without modifying agent loop internals
- completion fallback behavior is one helper path, reducing drift
- model-native reasoning support is isolated from provider-generic paths
- VM run-control can evolve independently from `/ws` query streaming while sharing app assembly and dependency boundaries
