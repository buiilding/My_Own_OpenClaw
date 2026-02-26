---
summary: "Detailed backend capability-to-file matrix for `backend/src`, mapping each runtime responsibility to concrete implementation modules."
read_when:
  - When implementing backend changes and selecting exact files to modify.
  - When reviewing backend regressions and tracing ownership quickly.
title: "Backend Capability to File Matrix Reference"
---

# Backend Capability to File Matrix Reference

This matrix maps backend capabilities to implementation files.

## Coverage Snapshot (2026-02-26)

- Total backend python files: `318`
- Domain counts: `agent=69`, `api=72`, `core=77`, `tools=31`, `llm=31`, `services=16`, `simulation=12`, `sdk=6`, `embeddings=2`

## 1) API Ingress and Transport

| Capability | Primary files | Notes |
| --- | --- | --- |
| FastAPI app assembly and router registration | `backend/src/main.py`, `backend/src/api/app_assembly.py`, `backend/src/api/routes/__init__.py` | Shared creation path for production runtime. |
| WebSocket handshake + connection cleanup | `backend/src/api/routes/websocket/connection.py`, `backend/src/api/routes/websocket/task_manager.py` | Policy-close on invalid handshake, session/task cleanup on disconnect. |
| Incoming payload parse + typed dispatch | `backend/src/api/routes/websocket/message_handler.py`, `backend/src/api/routes/websocket/json_parse.py`, `backend/src/api/infrastructure/registry.py` | JSON parse, schema validation, handler lookup. |
| Outgoing event envelope/send safety | `backend/src/api/transport/{websocket,sender,envelope,protocol}.py` | Serialized websocket send and standard context envelope fields. |
| Stream formatter routing | `backend/src/api/processing/formatter.py`, `backend/src/api/contracts/formatter_specs.py`, `backend/src/api/processing/formatters/*.py` | Internal event -> outgoing message contract mapping. |
| Memory REST endpoints | `backend/src/api/routes/memory/{embeddings,semantic,semantic_service,semantic_parser,health}.py` | Embeddings + semantic summarize/title flows. |
| Artifact upload/download endpoints | `backend/src/api/routes/artifacts.py`, `backend/src/services/artifacts/store.py` | Artifact IDs and base64 load/store support. |

## 2) Handler Responsibilities

| Capability | Primary files | Notes |
| --- | --- | --- |
| Query handler orchestration | `backend/src/api/handlers/query.py`, `backend/src/api/services/query_execution.py` | Active-task registration, streaming pipeline orchestration. |
| Stop-query cancellation | `backend/src/api/handlers/stop_query.py`, `backend/src/agent/session/manager.py` | Cancels in-flight user query task(s). |
| Tool result ingestion | `backend/src/api/handlers/tool_result.py`, `backend/src/agent/session/session.py` | Normalizes single/bundle payloads before session processing. |
| Settings update/load + models list | `backend/src/api/handlers/settings.py`, `backend/src/core/config/{manager,service,models}.py`, `backend/src/llm/models/model_service.py` | Frontend-owned patch path and model-provider list API. |
| Rehydrate transcript state | `backend/src/api/handlers/rehydrate.py`, `backend/src/api/services/rehydrate_execution.py` | Conversation history replacement and runtime reassociation. |
| Wakeword event handling | `backend/src/api/handlers/wakeword.py`, `backend/src/api/services/wakeword_execution.py` | Wakeword-triggered greeting/query flow. |
| Manual history compaction endpoint | `backend/src/api/handlers/compact_history.py`, `backend/src/agent/compaction/engine.py` | Manual compaction with active-query guard. |

## 3) Session and Agent Loop

| Capability | Primary files | Notes |
| --- | --- | --- |
| Per-user session creation/lock safety | `backend/src/agent/session/manager.py`, `backend/src/agent/session/initializer.py` | Per-user lock map prevents racey create/end/update. |
| Session runtime state stores | `backend/src/agent/session/{runtime_state,state}.py`, `backend/src/agent/session/session.py` | Holds system-state, conversation refs, tool execution refs/results. |
| Query execution state machine | `backend/src/agent/execution/{executor,interaction_loop,policies}.py` | Multi-iteration loop with terminal/error/tool branches. |
| Recoverable tool-call parse error bridge | `backend/src/agent/execution/tool_call_bridge.py`, `backend/src/agent/execution/interaction_loop.py` | Converts malformed tool-call payload issues into synthetic recoverable tool outputs. |
| Pre/mid-turn compaction integration | `backend/src/agent/compaction/{engine,models,prompt}.py`, `backend/src/agent/compaction/strategies/inline_summary.py` | Threshold/cooldown decision and summary insertion replacement. |

## 4) Tool Lifecycle (Prepare -> Send -> Wait -> Process)

| Capability | Primary files | Notes |
| --- | --- | --- |
| Tool preparation and coordinate resolution | `backend/src/agent/tools/preparation/preparer.py`, `backend/src/core/utils/coordinate_methods.py` | Normalizes and resolves tool-call arguments before send. |
| Tool send/event emission | `backend/src/agent/tools/sending/sender.py`, `backend/src/agent/tools/shared/{bundle_detection,bundle_result_formatter}.py` | Emits tool-call/tool-bundle events + synthetic pre-send failures. |
| Frontend result waiting/routing | `backend/src/agent/tools/waiting/{handler,receiver,router}.py` | Correlates request IDs and routes result futures. |
| Tool result transformation/history commit | `backend/src/agent/tools/processing/{processor,transformer,coordinator,synthetic_factory}.py`, `backend/src/agent/history/history_committer.py` | Converts raw tool results to model-facing history rows and cleanup path. |
| Backend tool registry and schema policy | `backend/src/tools/{registry,schema_registry,tool_policy,tool_selection,categorization}.py` | Tool availability and schema surfaces for prompt/validation path. |
| Single/bundle tool orchestration contracts | `backend/src/tools/{single_tool_execution,bundle_execution,orchestrator}.py`, `backend/src/tools/result_{helpers,types}.py` | Bundled and individual tool execution result contracts. |
| Remote tool adapter layer | `backend/src/tools/remote.py`, `backend/src/tools/remote_tools/*.py` | Frontend-executed tool bridge and compatibility layer. |

## 5) LLM Stack

| Capability | Primary files | Notes |
| --- | --- | --- |
| Provider-independent client API | `backend/src/llm/client.py`, `backend/src/llm/providers/base.py` | Unified completion/stream APIs. |
| Provider-specific request/stream behavior | `backend/src/llm/providers/{openai,anthropic,gemini,kimi_coding,mistral,openrouter,local,online}.py` | Provider overrides, stream assembly, usage diagnostics. |
| Parser and trust-boundary validation | `backend/src/llm/{parser,parser_extraction,parser_validation,parser_types}.py` | Tool-call extraction/validation from model output. |
| Prompt construction and transparency metadata | `backend/src/llm/prompts/{prompt_constructor,prompt_metadata,prompts}.py` | System prompt + tool schema + context shaping. |
| Model service and catalog | `backend/src/llm/models/{model_service,models_config}.py` | Provider model list, capability metadata. |
| Agent-facing stream processing | `backend/src/agent/llm/{llm_stream_processor,conversation_context,event_presenter,token_counting,stream_processor_helpers}.py` | Stream event normalization and presentation to API layer. |

## 6) Core Runtime Infrastructure

| Capability | Primary files | Notes |
| --- | --- | --- |
| Dependency graph and factory assembly | `backend/src/core/container/{application,core_container,tool_container,memory_container,api_container,initializer,factories,facade}.py` | DI topology and object ownership. |
| Bootstrap coordinator lifecycle | `backend/src/core/bootstrap/{coordinator,entrypoint,handler_initializer}.py` | Startup wiring, logging bootstrap, runtime launch helpers. |
| Config schema/load/update/subscribe | `backend/src/core/config/{models,app_config,loader,runtime,manager,service,subscriptions}.py` | App config policy, runtime assembly, subscriber propagation. |
| Event bus and cache layers | `backend/src/core/infrastructure/{bus,event_bus_registry,cache_store,cache_manager,cache_entry,cache}.py` | Event dispatch and cache utility abstractions. |
| Validation/security/observability | `backend/src/core/validation/validators.py`, `backend/src/core/security/{policy,executor}.py`, `backend/src/core/observability/trust_boundary_metrics.py` | Input boundaries, policy enforcement, trust-boundary telemetry. |
| Message and type conversion | `backend/src/core/messages/{structures,converters}.py`, `backend/src/core/types/{aliases,enums,schemas}.py` | Cross-layer type and message structures. |

## 7) Services, Embeddings, Simulation, SDK

| Capability | Primary files | Notes |
| --- | --- | --- |
| Token counting and model-window fallback | `backend/src/services/token_service.py` | Used by stream diagnostics and compaction thresholds. |
| OCR + vision coordinate pipeline | `backend/src/services/ocr/{ocr_service,helpers,runtime_config}.py`, `backend/src/services/vision/{vision_service,coordinates,utils}.py`, `backend/src/services/vision/providers/*.py` | Screen-grounding and coordinate prediction runtime. |
| Artifact storage service | `backend/src/services/artifacts/store.py` | Artifact upload/load lifecycle for screenshots/binary. |
| Embedding provider abstraction | `backend/src/embeddings/embeddings.py` | Embedding generation and provider abstraction. |
| Simulation runtime and mock clients | `backend/src/simulation/*` | Deterministic mock backend/LLM workflows. |
| SDK tool/context/sub-agent helpers | `backend/src/sdk/{tool,context}.py`, `backend/src/sdk/agents/{session_builder,response_extractor,config_helper}.py` | Tool authoring and constrained sub-session helper APIs. |

## Related Docs

- [Backend Inventory Docs Hub](README.md)
- [Backend Functionality Capability Catalog Reference](backend_functionality_capability_catalog_reference.md)
- [Backend Runtime Flow Matrix Reference](backend_runtime_flow_matrix_reference.md)
- [Backend Module File Index Reference](backend_module_file_index_reference.md)
