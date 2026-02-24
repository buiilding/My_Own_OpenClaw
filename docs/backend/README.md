---
summary: "Backend documentation hub covering bootstrap, API transport, agent runtime, tool lifecycle, model stack, and runtime services."
read_when:
  - When making backend changes beyond a single module.
  - When tracing full query lifecycle from WebSocket ingress to streamed response.
title: "Backend Functionality Map"
---

# Backend Functionality Map

This hub is the implementation-level map for `backend/src`. Use this as the entrypoint when changing backend behavior.

## Scope

Covers:

- Startup and dependency graph initialization
- Config/runtime policy normalization
- WebSocket + REST transport contracts
- Agent runtime loop and session lifecycle
- Tool lifecycle (prepare, send, wait, process)
- LLM provider/model/prompt/parser stack
- Runtime services (OCR, vision, embeddings, artifacts)

## Deep Pages

### Bootstrap

- [Bootstrap Docs Hub](bootstrap/README.md)
- [Bootstrap and Config](bootstrap/BOOTSTRAP_AND_CONFIG.md)
- [Container DI and Initialization Lifecycle Reference](bootstrap/CONTAINER_DI_AND_INIT_LIFECYCLE_REFERENCE.md)
- [Config Docs Hub](config/README.md)
- [Config Fields and Runtime Policy](config/CONFIG_FIELDS_AND_RUNTIME_POLICY.md)

### API and Contracts

- [API Docs Hub](api/README.md)
- [Contracts Docs Hub](contracts/README.md)
- [API and Transport](api/API_AND_TRANSPORT.md)
- [HTTP and WebSocket Endpoint Reference](api/HTTP_AND_WS_ENDPOINT_REFERENCE.md)
- [App Assembly and Container Dependency Reference](api/APP_ASSEMBLY_AND_CONTAINER_DEPENDENCY_REFERENCE.md)
- [Memory Route Validation and Fallback Reference](api/MEMORY_ROUTE_VALIDATION_AND_FALLBACK_REFERENCE.md)
- [WebSocket Connection and Task Lifecycle Reference](api/WEBSOCKET_CONNECTION_AND_TASK_LIFECYCLE_REFERENCE.md)
- [Handler Registry and Error Envelope Reference](api/HANDLER_REGISTRY_AND_ERROR_ENVELOPE_REFERENCE.md)
- [Non-Query Handler and Control Flow Reference](api/NON_QUERY_HANDLER_AND_CONTROL_FLOW_REFERENCE.md)
- [WebSocket Message Contracts](contracts/WEBSOCKET_MESSAGE_CONTRACTS.md)
- [Message Schema and Formatter Reference](contracts/MESSAGE_SCHEMA_AND_FORMATTER_REFERENCE.md)
- [Handler Behavior Matrix](api/HANDLER_BEHAVIOR_MATRIX.md)

### Runtime and Tools

- [Runtime Docs Hub](runtime/README.md)
- [Agent and Tool Runtime](runtime/AGENT_AND_TOOL_RUNTIME.md)
- [Session State and Lifecycle](runtime/SESSION_STATE_AND_LIFECYCLE.md)
- [Query Execution and Stream Pipeline Reference](runtime/QUERY_EXECUTION_AND_STREAM_PIPELINE_REFERENCE.md)
- [Token Count Event and Usage Diagnostics Reference](runtime/TOKEN_COUNT_EVENT_AND_USAGE_DIAGNOSTICS_REFERENCE.md)
- [Tools Docs Hub](tools/README.md)
- [Frontend Tool Bridge and Policy](tools/FRONTEND_TOOL_BRIDGE_AND_POLICY.md)
- [Tool Security Policy and Executor Reference](tools/TOOL_SECURITY_POLICY_AND_EXECUTOR_REFERENCE.md)
- [Tool Result Ingress and Storage Reference](tools/TOOL_RESULT_INGRESS_AND_STORAGE_REFERENCE.md)
- [Tool Preparation and Coordinate Resolution Reference](tools/TOOL_PREPARATION_AND_COORDINATE_RESOLUTION_REFERENCE.md)

### LLM and Services

- [LLM Docs Hub](llm/README.md)
- [Services Docs Hub](services/README.md)
- [LLM Models and Parsing](llm/LLM_MODELS_AND_PARSING.md)
- [Provider Factory and Runtime Selection Reference](llm/PROVIDER_FACTORY_AND_RUNTIME_SELECTION_REFERENCE.md)
- [Parser Trust Boundary and Native Tool-Call Reference](llm/PARSER_TRUST_BOUNDARY_AND_NATIVE_TOOL_CALL_REFERENCE.md)
- [Services and Storage](services/SERVICES_AND_STORAGE.md)
- [Embedding and Semantic Memory Runtime Reference](services/EMBEDDING_AND_SEMANTIC_MEMORY_RUNTIME_REFERENCE.md)
- [Artifact, Screenshot, and System-State Flow Reference](services/ARTIFACT_SCREENSHOT_AND_SYSTEM_STATE_FLOW_REFERENCE.md)
- [TTS and Wakeword Audio Runtime Reference](services/TTS_AND_WAKEWORD_AUDIO_RUNTIME_REFERENCE.md)
- [OCR and Vision Coordinate Runtime Reference](services/OCR_AND_VISION_COORDINATE_RUNTIME_REFERENCE.md)

## Backend Layout (Code)

Primary folders under `backend/src`:

- `agent/`: session state, execution loop, tool lifecycle, history commit
- `api/`: routes, handlers, schemas, transport wrappers, response formatting
- `core/`: bootstrap, DI containers, config, events, interfaces, validation
- `llm/`: provider abstraction, model cataloging, prompt construction, parsing
- `tools/`: backend-visible tool schema registry and orchestration bridge
- `services/`: OCR, vision, artifacts, token counting
- `embeddings/`: sentence-transformer embedding provider

## End-to-End Query Path (Condensed)

1. `/ws` receives message and handshake-validates connection.
2. Incoming message is parsed and validated via discriminated Pydantic schemas.
3. Handler registry dispatches by `type` (for example `query`).
4. Query handler starts stream pipeline + TTS session and delegates to `AgentSession`.
5. Agent loop builds prompt, calls provider, parses response, may dispatch tools.
6. Tool results return from frontend (`tool-result` or `tool-bundle-result`).
7. Result processor commits tool outputs to history, loop continues or completes.
8. Streamed events are formatted and sent back to frontend with transport context.
