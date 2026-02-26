---
summary: "Capability-level backend catalog for `backend/src`, mapping concrete runtime behavior to ownership files and cross-layer contracts."
read_when:
  - When you need a capability-first backend map before touching code.
  - When validating that a backend change keeps query/tool/stream contracts intact.
title: "Backend Functionality Capability Catalog Reference"
---

# Backend Functionality Capability Catalog Reference

This page is the capability-first technical catalog for `backend/src`.

## Coverage Snapshot (2026-02-26)

- Python files in `backend/src`: `318`
- Domain split:
  - `agent`: `69`
  - `api`: `72`
  - `core`: `77`
  - `tools`: `31`
  - `llm`: `31`
  - `services`: `16`
  - `simulation`: `12`
  - `sdk`: `6`
  - `embeddings`: `2`

## 1) Runtime Boot + Dependency Graph

Primary files:

- `backend/src/main.py`
- `backend/src/api/app_assembly.py`
- `backend/src/core/bootstrap/coordinator.py`
- `backend/src/core/bootstrap/entrypoint.py`
- `backend/src/core/container/*`

Capabilities:

- Builds shared FastAPI app (`create_api_app`) with default CORS and router registration.
- Runs coordinated startup to build container/session/runtime dependencies.
- Stores container in API deps during lifespan startup and clears on shutdown.
- Reuses shared uvicorn/logging bootstrap across production and simulation entrypoints.

## 2) API Surface + Transport Contracts

Primary files:

- `backend/src/api/routes/websocket/{connection,message_handler,json_parse,task_manager}.py`
- `backend/src/api/routes/memory/{embeddings,semantic,semantic_service,semantic_parser,health}.py`
- `backend/src/api/routes/artifacts.py`
- `backend/src/api/transport/{websocket,sender,envelope,protocol}.py`
- `backend/src/api/contracts/{message_types,formatter_specs,registry}.py`
- `backend/src/api/schemas/{incoming,outgoing,common}.py`

Capabilities:

- WebSocket handshake validation (`HandshakeMessage`) with policy-violation close on bad payloads.
- Size-aware JSON parse path and typed handler routing.
- Safe websocket sender queue + protocol envelope context fields (`user_id`, `session_id`, `turn_ref`, `conversation_ref`).
- Memory REST routes for embeddings and semantic summarize/title workloads.
- Artifact upload/download routes for screenshot and binary references.

## 3) Handler Layer Capability Map

Primary files:

- `backend/src/api/handlers/{query,tool_result,settings,stop_query,rehydrate,wakeword,compact_history}.py`

Capabilities:

- `query`: registers active task metadata, delegates full execution to `QueryExecutionService`.
- `stop_query`: cancels current active task for user and emits cancellation semantics.
- `tool_result`: normalizes `tool-result`/`tool-bundle-result` payloads and routes to session.
- `settings`: frontend-owned config patch flow + model/provider list interactions.
- `rehydrate`: transcript replacement and active conversation reassociation.
- `wakeword`: greeting/query wakeword entry path.
- `compact_history`: manual compaction trigger with active-query guard and started/completed events.

## 4) Query Execution + Stream Pipeline

Primary files:

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/formatters/*`
- `backend/src/api/processing/tts/{manager,processor}.py`
- `backend/src/api/services/tts_session.py`

Capabilities:

- Validates query text and creates/reuses session.
- Applies backend-only runtime state seed before tool preparation (`active_window`, `mouse_position`, `screen_resolution`).
- Supports screenshot input via inline base64 or artifact reference lookup.
- Emits fallback `streaming-complete` when upstream stream ends without terminal event.
- On cancel, reconciles pending staged tool calls into synthetic cancelled tool outputs for history integrity.
- Runs TTS lifecycle around stream pipeline with flush/wait semantics.

## 5) Session Lifecycle + Runtime State

Primary files:

- `backend/src/agent/session/{manager,session,state,runtime_state,initializer,lifecycle,config_runtime}.py`

Capabilities:

- Per-user session cache with per-user async locks to avoid concurrent create/end races.
- Active query task tracking supports multiple tasks per user, cancellation, and cleanup.
- Runtime config rewire flow updates live sessions on global config changes.
- Session cleanup clears runtime registries/tool futures and removes lock entries.

## 6) Agent Execution Loop + Compaction

Primary files:

- `backend/src/agent/execution/{executor,interaction_loop,policies,tool_call_bridge}.py`
- `backend/src/agent/compaction/{engine,models,prompt}.py`
- `backend/src/agent/compaction/strategies/{base,inline_summary}.py`

Capabilities:

- Iterative loop: prompt build -> LLM stream -> parse -> tool execution -> continue/finish.
- Auto-mid compaction evaluation and explicit compaction event emission.
- Manual compaction support through handler + session API.
- Recoverable tool-call parse errors are converted into synthetic tool-call/tool-output events instead of hard-aborting.
- Bundle execution waits inline before next loop iteration; cleanup path always runs in `finally`.

## 7) Tool Lifecycle (Prepare, Send, Wait, Process)

Primary files:

- `backend/src/agent/tools/preparation/preparer.py`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/waiting/{handler,receiver,router}.py`
- `backend/src/agent/tools/processing/{coordinator,processor,transformer,synthetic_factory}.py`
- `backend/src/agent/history/history_committer.py`
- `backend/src/tools/{registry,orchestrator,single_tool_execution,bundle_execution,remote,remote_tools/*}.py`

Capabilities:

- Preparation: coordinate resolution + OCR/screenshot context + resolved-call storage.
- Sending: emits `tool-call` or `tool-bundle` payloads for frontend runtime execution.
- Waiting: request/bundle future tracking with correlation IDs and timeout/error synthesis.
- Processing: transforms results into model-facing tool outputs and commits history rows.
- Supports synthetic result generation for frontend-stale or backend-preparation failures.

## 8) LLM Stack (Providers, Models, Parsing, Prompts)

Primary files:

- `backend/src/llm/client.py`
- `backend/src/llm/providers/*`
- `backend/src/llm/models/{model_service,models_config}.py`
- `backend/src/llm/prompts/*`
- `backend/src/llm/{parser,parser_extraction,parser_validation,parser_types,request_kwargs,client_response_normalization}.py`

Capabilities:

- Provider-agnostic completion/stream interface with normalized response payloads.
- Provider-specific request overrides and stream delta normalization.
- Model catalog + provider/model selection rules (online, local, thinking/vision capabilities).
- Prompt constructor with metadata/transparency payloads and tool schema shaping.
- Tool-call extraction and trust-boundary validation before loop execution.

## 9) Core Runtime Infrastructure

Primary files:

- `backend/src/core/config/*`
- `backend/src/core/bootstrap/*`
- `backend/src/core/container/*`
- `backend/src/core/infrastructure/*`
- `backend/src/core/{events,messages,types,interfaces,services,security,validation,observability,logging_setup}.py`

Capabilities:

- Config schema + runtime assembly policies + subscriber-based update propagation.
- Containerized dependency graph for API/agent/tools/services.
- Event bus, cache layers, structured exception types, and security policy enforcement.
- Input validation and frontend patch allowlist boundary.
- Trust-boundary metrics for parser/prompt/transport enforcement telemetry.

## 10) Runtime Services + Storage

Primary files:

- `backend/src/services/token_service.py`
- `backend/src/services/artifacts/*`
- `backend/src/services/ocr/*`
- `backend/src/services/vision/*`
- `backend/src/services/vision/providers/*`
- `backend/src/embeddings/embeddings.py`

Capabilities:

- Token counting and model-aware token-window utilities.
- Artifact store for upload and base64 retrieval by reference ID.
- OCR service for screenshot text extraction with runtime fallback policy.
- Vision providers for UI coordinate prediction and scale normalization.
- Embedding provider abstraction used by memory/semantic endpoints.

## 11) Simulation + SDK Surfaces

Primary files:

- `backend/src/simulation/*`
- `backend/src/sdk/{tool,context}.py`
- `backend/src/sdk/agents/{session_builder,response_extractor,config_helper}.py`

Capabilities:

- Simulation app and mock LLM clients for deterministic backend/runtime testing.
- SDK `Tool` and `ToolContext` contracts for custom tool implementations.
- Sub-agent helpers for constrained session build/response extraction flows.

## 12) End-to-End Contract Checkpoints

1. WebSocket client connects and sends handshake (`user_id` required).
2. `query` handler registers active task and delegates query execution service.
3. Service streams loop events through formatter/transport and optional TTS.
4. Tool events execute in frontend/sidecar; results return via `tool-result` or `tool-bundle-result`.
5. Backend processes/commits tool outputs into history, then continues or completes turn.
6. `streaming-complete` is emitted from model stream or backend fallback synthesizer.

## Related Docs

- [Backend Inventory Docs Hub](README.md)
- [Backend Full Functionality Inventory Reference](backend_full_functionality_inventory_reference.md)
- [Backend Runtime Flow Matrix Reference](backend_runtime_flow_matrix_reference.md)
- [Backend Module File Index Reference](backend_module_file_index_reference.md)
