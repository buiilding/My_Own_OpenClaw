---
summary: "Matrix view of backend runtime flows from ingress to response, with exact module ownership across API, agent, tool, LLM, and services layers."
read_when:
  - When tracing a backend behavior end-to-end across layers.
  - When validating that new backend features attach to correct runtime seams.
title: "Backend Runtime Flow Matrix Reference"
---

# Backend Runtime Flow Matrix Reference

This matrix maps runtime responsibilities to exact modules in `backend/src`.

## Core Runtime Flows

| Runtime flow | Entry module | Core orchestrators | Completion/exit modules |
| --- | --- | --- | --- |
| Process startup + app assembly | `backend/src/main.py` | `backend/src/core/bootstrap/coordinator.py`, `backend/src/api/app_assembly.py` | FastAPI lifespan shutdown in `backend/src/main.py` |
| HTTP memory route flow | `backend/src/api/routes/memory/{embeddings,semantic,health}.py` | `backend/src/api/routes/memory/semantic_service.py`, `backend/src/api/routes/memory/semantic_parser.py` | Route response + sanitized error mapping |
| HTTP artifact upload/load flow | `backend/src/api/routes/artifacts.py` | `backend/src/services/artifacts/store.py` | Route response envelope |
| WebSocket connection + handshake | `backend/src/api/routes/websocket/__init__.py` | `backend/src/api/routes/websocket/connection.py`, `backend/src/api/routes/websocket/task_manager.py` | Connection cleanup + session end |
| Incoming message parse/validation | `backend/src/api/routes/websocket/message_handler.py` | `backend/src/api/routes/websocket/json_parse.py`, `backend/src/api/schemas/incoming.py` | Handler dispatch via registry |
| Handler dispatch | `backend/src/api/infrastructure/registry.py` | Typed handlers in `backend/src/api/handlers/*.py` | Error envelope in `backend/src/api/infrastructure/errors.py` |
| Query execution stream flow | `backend/src/api/handlers/query.py` | `backend/src/api/services/query_execution.py`, `backend/src/api/processing/pipeline.py` | `streaming-complete` formatter + send path |

## Agent Loop + Tool Turn Flows

| Runtime flow | Entry module | Core orchestrators | Completion/exit modules |
| --- | --- | --- | --- |
| Session lifecycle | `backend/src/agent/session/manager.py` | `backend/src/agent/session/session.py`, `backend/src/agent/session/lifecycle.py` | Session removal + task cleanup |
| Query execution in session | `backend/src/agent/session/session.py` | `backend/src/agent/execution/executor.py`, `backend/src/agent/execution/interaction_loop.py` | Assistant output commit to history |
| Prompt and tool-schema prep | `backend/src/agent/llm/conversation_context.py` | `backend/src/llm/prompts/prompt_constructor.py`, `backend/src/tools/registry.py` | Prompt metadata events via presenter |
| LLM request + stream parse | `backend/src/agent/llm/llm_stream_processor.py` | `backend/src/llm/client.py`, `backend/src/llm/providers/*.py`, `backend/src/llm/parser.py` | Parsed response + token diagnostics |
| Tool preparation phase | `backend/src/agent/tools/preparation/preparer.py` | Screenshot + OCR helpers, coordinate resolvers | Resolved tool call registration |
| Tool send phase | `backend/src/agent/tools/sending/sender.py` | Tool/bundle event shaping | `tool-call` / `tool-bundle` event emission |
| Tool wait phase | `backend/src/tools/orchestrator.py` | `backend/src/tools/single_tool_execution.py`, `backend/src/tools/bundle_execution.py` | Awaited result (single/bundle) |
| Tool result ingress from frontend | `backend/src/api/handlers/tool_result.py` | `backend/src/agent/tools/waiting/{handler,receiver,router}.py` | Future resolution in result storage |
| Tool result processing phase | `backend/src/agent/tools/processing/processor.py` | `backend/src/agent/tools/processing/transformer.py`, `backend/src/agent/history/history_committer.py` | History mutation + cleanup |

## API Processing + Transport Flows

| Runtime flow | Entry module | Core orchestrators | Completion/exit modules |
| --- | --- | --- | --- |
| Stream event formatting | `backend/src/api/processing/formatter.py` | `backend/src/api/processing/formatters/*.py`, `backend/src/api/contracts/formatter_specs.py` | Outgoing schema alignment |
| TTS filtering + stream | `backend/src/api/processing/tts/processor.py` | `backend/src/api/processing/tts/manager.py`, `backend/src/core/services/tts_service.py` | `audio-chunk` payload relay |
| Outbound transport send | `backend/src/api/transport/sender.py` | `backend/src/api/transport/websocket.py`, `backend/src/api/transport/envelope.py` | Safe websocket queued send |

## Shared Infrastructure Flows

| Runtime flow | Entry module | Core orchestrators | Completion/exit modules |
| --- | --- | --- | --- |
| Dependency graph composition | `backend/src/core/container/application.py` | `core_container`, `tool_container`, `memory_container`, `api_container` | Container facade exposure |
| Config load/update/subscribe | `backend/src/core/config/manager.py` | `backend/src/core/config/service.py`, `backend/src/core/config/subscriptions.py` | Config-changed propagation |
| Event publication | `backend/src/core/infrastructure/bus.py` | `backend/src/core/events/{bus_events,streaming_events}.py` | Subscriber callbacks |
| Security/trust boundary | `backend/src/core/security/policy.py` | `backend/src/core/security/executor.py`, `backend/src/core/observability/trust_boundary_metrics.py` | Policy enforcement + metrics |

## LLM + Services Integration Flows

| Runtime flow | Entry module | Core orchestrators | Completion/exit modules |
| --- | --- | --- | --- |
| Provider selection and factory cache | `backend/src/llm/providers/__init__.py` | Provider classes in `backend/src/llm/providers/*.py` | Bound provider instance |
| Model discovery/listing | `backend/src/llm/models/model_service.py` | Models config in `backend/src/llm/models/models_config.py` | Models API payload |
| Token counting diagnostics | `backend/src/services/token_service.py` | `backend/src/agent/llm/token_counting.py` | `token-count` stream event |
| OCR/vision coordinate resolution | `backend/src/services/ocr/ocr_service.py` | `backend/src/services/vision/vision_service.py`, provider modules | Pixel coordinate output |
| Embedding provider path | `backend/src/embeddings/embeddings.py` | Used by memory routes/services | Embedding vectors |

## Module Pairs That Must Stay In Sync

- `backend/src/api/schemas/incoming.py` and `backend/src/api/contracts/message_types.py`
- `backend/src/api/contracts/formatter_specs.py` and `backend/src/api/processing/formatters/*.py`
- `backend/src/tools/*/schemas.py` and sidecar tool schemas under `frontend/src/main/python/tools/schemas.py`
- `backend/src/llm/parser.py` and `backend/src/llm/parser_validation.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py` and `backend/src/tools/{single_tool_execution,bundle_execution}.py`

## Related Docs

- [Backend Inventory Docs Hub](README.md)
- [Backend Full Functionality Inventory Reference](backend_full_functionality_inventory_reference.md)
- [Backend Module File Index Reference](backend_module_file_index_reference.md)
