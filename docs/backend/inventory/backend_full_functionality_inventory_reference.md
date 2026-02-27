---
summary: "Current exhaustive backend functionality inventory across API transport, agent runtime, tool orchestration, LLM provider stack, and service domains."
read_when:
  - When auditing backend ownership boundaries or adding new backend capabilities.
  - When changing query/stream/tool lifecycle and validating cross-layer contracts.
title: "Backend Full Functionality Inventory Reference"
---

# Backend Full Functionality Inventory Reference

This is the canonical current-state inventory for `backend/src`.

## Coverage Snapshot (2026-02-27)

Source counts used in this inventory:

- Python files in `backend/src`: `322`
- Domain split:
  - `agent`: `70`
  - `api`: `73`
  - `core`: `77`
  - `tools`: `31`
  - `llm`: `33`
  - `services`: `16`
  - `simulation`: `12`
  - `sdk`: `6`
  - `embeddings`: `2`

## 1) Runtime Boot and App Assembly

Primary files:

- `backend/src/main.py`
- `backend/src/api/app_assembly.py`
- `backend/src/core/bootstrap/coordinator.py`
- `backend/src/core/bootstrap/entrypoint.py`

Functionality:

- Creates FastAPI app and registers all API routers.
- Applies default CORS policy.
- Initializes DI/container/runtime in lifespan startup.
- Clears app container on shutdown.
- Provides shared entrypoint/runtime bootstrap for backend and simulation modes.

## 2) API Layer Inventory

### 2.1 Endpoint and Connection Runtime

Primary files:

- `backend/src/api/routes/websocket/__init__.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/routes/websocket/json_parse.py`
- `backend/src/api/routes/artifacts.py`
- `backend/src/api/routes/memory/{embeddings,semantic,semantic_service,semantic_parser,health}.py`

Functionality:

- Handles websocket handshake and user identity validation.
- Enforces per-connection task limits and cancellation/cleanup semantics.
- Parses websocket frames with size-aware policy.
- Dispatches validated incoming messages to typed handlers.
- Exposes artifact upload/download endpoints.
- Exposes memory REST endpoints for embeddings/semantic summarize/title/health.

### 2.2 Handler Runtime

Primary files:

- `backend/src/api/handlers/query.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/handlers/tool_result.py`
- `backend/src/api/handlers/settings.py`
- `backend/src/api/handlers/rehydrate.py`
- `backend/src/api/handlers/wakeword.py`
- `backend/src/api/handlers/compact_history.py`

Functionality:

- `query`: starts stream execution task and delegates to query execution service.
- `stop_query`: cancels active query task by user and emits stop semantics.
- `tool_result`: ingests tool/synthetic/bundle results from frontend.
- `settings`: load/update frontend-owned settings and model list retrieval.
- `rehydrate`: replaces conversation history from frontend transcript snapshot.
- `wakeword`: handles wakeword-triggered entry flow.
- `compact_history`: manual compaction trigger path.

### 2.3 Service Runtime (API)

Primary files:

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/services/tts_session.py`

Functionality:

- Query orchestration service:
  - Validates query text.
  - Loads/creates agent session.
  - Applies runtime system-state payload into session state.
  - Streams events through formatter + transport pipeline.
  - Synthesizes fallback completion when stream lacks terminal event.
- Rehydrate/wakeword helper services encapsulate non-query handler logic.
- Shared TTS session helper manages lifecycle across query/wakeword flows.

### 2.4 Stream Processing, Formatting, and Transport

Primary files:

- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/formatters/*`
- `backend/src/api/processing/tts/{manager,processor}.py`
- `backend/src/api/transport/{websocket,sender,envelope,protocol}.py`

Functionality:

- Converts internal streaming events into websocket-safe payloads.
- Attaches context envelope fields (`session_id`, `turn_ref`, `conversation_ref`, `user_id`).
- Manages TTS suppression and audio chunk stream path.
- Serializes websocket send operations through safe transport wrappers.

### 2.5 API Contracts and Schemas

Primary files:

- `backend/src/api/contracts/{message_types,formatter_specs,registry}.py`
- `backend/src/api/schemas/{common,incoming,outgoing}.py`
- `backend/src/api/schema.py`

Functionality:

- Defines canonical incoming/outgoing envelope schemas.
- Defines event formatter route table.
- Enforces message-type constant and outgoing-schema parity for query/settings/control ACK payloads.
- Provides compatibility schema export façade.

## 3) Agent Runtime Inventory

### 3.1 Session Runtime

Primary files:

- `backend/src/agent/session/{manager,session,state,runtime_state,initializer,config_runtime,lifecycle}.py`

Functionality:

- Creates and tracks per-user `AgentSession` objects.
- Applies runtime config updates with lock safety.
- Tracks active query tasks for cancellation.
- Stores runtime state for screenshots/system_state/resolved tool calls/results.
- Handles transcript rehydrate and active conversation switching.

### 3.2 Query Execution Loop

Primary files:

- `backend/src/agent/execution/{executor,interaction_loop,policies,tool_call_bridge}.py`

Functionality:

- Appends user message + optional screenshot into conversation history.
- Runs iterative loop:
  - prompt build
  - LLM response stream
  - parse tool calls
  - tool execution + result processing
  - continue/complete decision
- Handles compaction pre-turn and mid-loop decisions/events.
- Handles recoverable malformed tool-call payloads by emitting synthetic tool events.
- Ensures cleanup/process-results runs even on errors/cancellation.

### 3.3 Agent LLM Presentation Runtime

Primary files:

- `backend/src/agent/llm/{conversation_context,llm_stream_processor,event_presenter,token_counting,stream_processor_helpers}.py`

Functionality:

- Builds iteration-aware prompt + schema payloads.
- Processes provider streams into normalized agent events.
- Emits transparency events (`system-prompt`, full user/assistant message, tool schemas).
- Emits token count / cache diagnostic events.

### 3.4 Agent Tool Lifecycle Runtime

Primary files:

- `backend/src/agent/tools/orchestrator.py`
- `backend/src/agent/tools/preparation/*`
- `backend/src/agent/tools/sending/*`
- `backend/src/agent/tools/waiting/*`
- `backend/src/agent/tools/processing/*`
- `backend/src/agent/history/history_committer.py`

Functionality:

- Preparation:
  - screenshot management and OCR coordination.
  - coordinate resolution and resolved-call storage.
- Sending:
  - emits `tool-call` or `tool-bundle` events for frontend execution.
  - emits synthetic immediate tool-output for pre-send failures.
- Waiting:
  - waits on result futures for individual requests or bundles.
- Processing:
  - transforms/commits results into conversation history.
  - performs bundle and synthetic-result cleanup.

## 4) Backend Tool Domain Inventory (`backend/src/tools`)

Primary files:

- `backend/src/tools/{registry,orchestrator,remote,remote_tools/*,bundle_execution,single_tool_execution,tool_policy,schema_registry,schema_fields,result_*}.py`
- `backend/src/tools/browser/*`
- `backend/src/tools/{computer,filesystem,system}/schemas.py`

Functionality:

- Maintains backend-visible remote tool registry/schemas.
- Filters tool availability by policy/interaction mode.
- Waits for frontend-executed tool results and adapts them for agent loop.
- Supports atomic bundle wait path and single-tool wait path.
- Defines browser/system/filesystem/computer schema surfaces.

## 5) LLM Domain Inventory (`backend/src/llm`)

Primary files:

- Client: `backend/src/llm/client.py`
- Providers: `backend/src/llm/providers/*`
- Models: `backend/src/llm/models/*`
- Prompts: `backend/src/llm/prompts/*`
- Parsing: `backend/src/llm/{parser,parser_extraction,parser_validation,parser_types,request_kwargs,client_response_normalization}.py`

Functionality:

- Provider-agnostic client runtime (`LiteLLMClient`) with normalized response contract.
- Provider selection/factory lifecycle and provider-specific overrides.
- Streaming and non-stream completion transport, including chunk-level tool-call aggregation.
- Provider helper stack for response parsing fallback, usage diagnostics, and thinking extraction.
- Model catalog service:
  - static online/thinking/vision catalogs.
  - dynamic local provider model discovery.
- Prompt construction/system prompt management/transparency metadata.
- Tool-call parser extraction and validation boundaries.

## 6) Core Domain Inventory (`backend/src/core`)

Primary files:

- Config: `backend/src/core/config/*`
- Container/bootstrap/runtime: `backend/src/core/bootstrap/*`, `backend/src/core/container/*`
- Infrastructure: `backend/src/core/infrastructure/*`
- Validation: `backend/src/core/validation/*`
- Interfaces/types/messages: `backend/src/core/{interfaces,types,messages}/*`

Functionality:

- Strong typed config models and provider API-key override handling.
- Runtime config assembly and API key loading policies.
- Container lifecycle and dependency resolution wiring.
- Event bus/cache/exception hierarchies.
- Frontend config validation allowlist and schema-bound checks.
- Shared type aliases/schemas/message conversion helpers.

## 7) Services Domain Inventory (`backend/src/services`)

Primary files:

- Artifacts: `backend/src/services/artifacts/*`
- OCR: `backend/src/services/ocr/*`
- Vision: `backend/src/services/vision/*`
- Token service: `backend/src/services/token_service.py`

Functionality:

- Artifact storage/retrieval for screenshot and binary uploads.
- OCR runtime helpers and screenshot text extraction.
- Vision provider runtime and coordinate scaling.
- Token counting/message normalization fallback service.

## 8) Embedding + SDK + Simulation

### Embeddings (`backend/src/embeddings`)

- Embedding provider abstraction and embedding generation runtime.

### SDK (`backend/src/sdk`)

- Tool context and SDK tool contracts.
- Session helper utilities for sub-agent/session integration.

### Simulation (`backend/src/simulation`)

- Mock backend app lifecycle and mock LLM clients.
- Compatibility adapters for simulation/testing flows.

## 9) End-to-End Request/Tool/Stream Lifecycle

1. Websocket client sends `query`.
2. Query handler registers active task and delegates to `QueryExecutionService`.
3. Service obtains session and streams agent events through processing pipeline.
4. Agent executor interaction loop calls LLM and decides tool/no-tool branch.
5. Tool branch emits frontend tool calls, waits for frontend results, commits tool outputs to history.
6. Streaming formatter emits chunk/thinking/tool events to websocket.
7. Completion event emitted (or synthesized fallback completion if missing).
8. Stop-query handler can cancel active query task at any time.

## 10) Drift Watchpoints

High-change areas likely to require docs updates when code changes:

- `api/services/query_execution.py` and `agent/execution/interaction_loop.py` event sequencing.
- `tools/*` + `agent/tools/*` bundle/single execution and cleanup semantics.
- `llm/providers/*` request/stream normalization behavior.
- `api/processing/formatters/*` payload shape contracts consumed by renderer.
- `core/config/models.py` frontend-owned config field changes.

## 11) Recompute Snapshot Commands

Use these commands to refresh the counts in this page:

- Total and domain split:
  - `python - <<'PY'`
  - `import glob`
  - `root='backend/src'`
  - `files=[p for p in glob.glob(root+'/**/*.py',recursive=True)]`
  - `print('total',len(files))`
  - `for d in ['agent','api','core','tools','llm','services','simulation','sdk','embeddings']:`  
  - `    print(d,len([p for p in files if p.startswith(f'{root}/{d}/')]))`
  - `PY`

## 12) Related Docs

- [Backend Inventory Docs Hub](README.md)
- [Backend Functionality Capability Catalog Reference](backend_functionality_capability_catalog_reference.md)
- [Backend Capability to File Matrix Reference](backend_capability_to_file_matrix_reference.md)
- [Backend Runtime Flow Matrix Reference](backend_runtime_flow_matrix_reference.md)
- [Backend Module File Index Reference](backend_module_file_index_reference.md)

When deep references disagree with this inventory, update deep pages and preserve this file as the backend canonical map.
