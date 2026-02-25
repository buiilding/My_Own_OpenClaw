---
summary: "Exhaustive backend functionality inventory across `backend/src` domains, runtime flows, and module ownership boundaries."
read_when:
  - When auditing backend feature coverage or onboarding across all backend runtime domains.
  - When adding/changing backend behavior and deciding which module owns the change.
title: "Backend Full Functionality Inventory Reference"
---

# Backend Full Functionality Inventory Reference

This page is a code-grounded, end-to-end inventory of backend functionality in `backend/src`.

## Coverage Snapshot

Source inventory used for this reference:

- Python files in `backend/src`: `287`
- Domain split:
- `agent`: `60`
- `api`: `67`
- `core`: `69`
- `tools`: `31`
- `llm`: `24`
- `services`: `14`
- `simulation`: `12`
- `sdk`: `6`
- `embeddings`: `2`

## Runtime Entry + Lifecycle

Primary backend entry and app assembly:

- `backend/src/main.py`
- `backend/src/api/app_assembly.py`
- `backend/src/core/bootstrap/coordinator.py`
- `backend/src/core/bootstrap/entrypoint.py`

Functional behavior:

- FastAPI app creation with shared router registration and default CORS policy.
- Lifespan startup initializes DI container and session runtime through `InitializationCoordinator`.
- Lifespan shutdown clears app-scoped container reference and ends runtime cleanly.

## API Functionality Inventory

Primary API surface:

- Transport and endpoint wiring:
- `backend/src/api/routes/websocket/__init__.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/routes/websocket/json_parse.py`
- `backend/src/api/routes/memory/embeddings.py`
- `backend/src/api/routes/memory/semantic.py`
- `backend/src/api/routes/memory/semantic_service.py`
- `backend/src/api/routes/memory/semantic_parser.py`
- `backend/src/api/routes/memory/health.py`
- `backend/src/api/routes/artifacts.py`

WebSocket functionality:

- `/ws` handshake validation with user identity and policy-close behavior.
- Size-aware JSON parse path for incoming frames.
- Pydantic discriminated validation for incoming message contracts.
- Concurrent task management with max-per-connection guard and cleanup.
- Route dispatch via handler registry with typed handler interfaces.
- Standardized error envelope sanitization.

Message handlers:

- `backend/src/api/handlers/query.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/handlers/tool_result.py`
- `backend/src/api/handlers/settings.py`
- `backend/src/api/handlers/rehydrate.py`
- `backend/src/api/handlers/wakeword.py`

Handler functionality:

- Query orchestration with active-task registration and stream lifecycle.
- Stop-query cancellation path and completion semantics.
- Tool-result and tool-bundle-result normalization/routing into session runtime.
- Settings load/update and model listing.
- Transcript rehydrate path for renderer resume.
- Wakeword detected event path and greeting/TTS flow.

Stream processing and formatting:

- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/formatters/*.py`
- `backend/src/api/processing/tts/manager.py`
- `backend/src/api/processing/tts/processor.py`

Processing functionality:

- Streaming event to websocket payload formatting.
- Event-type-specific formatter dispatch and guard checks.
- Context envelope attachment (`session_id`, `turn_ref`, `conversation_ref`, `user_id`).
- Concurrent TTS processing, code/json suppression, chunk relay.

Transport abstractions:

- `backend/src/api/transport/websocket.py`
- `backend/src/api/transport/sender.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/transport/protocol.py`

Transport functionality:

- `SafeWebSocket` queue-based send serialization.
- Sender abstraction for pipeline handlers.
- Transport payload wrapping and context-field attachment.

Contracts and schemas:

- `backend/src/api/contracts/message_types.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/schemas/common.py`
- `backend/src/api/schemas/incoming.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/api/schema.py`

Contract functionality:

- Canonical message-type constants.
- Canonical event->formatter registration specs.
- Incoming and outgoing message schema ownership.

## Agent Runtime Functionality Inventory

Primary agent runtime modules:

- Session/runtime ownership:
- `backend/src/agent/session/session.py`
- `backend/src/agent/session/manager.py`
- `backend/src/agent/session/state.py`
- `backend/src/agent/session/runtime_state.py`
- `backend/src/agent/session/initializer.py`
- `backend/src/agent/session/config_runtime.py`
- `backend/src/agent/session/lifecycle.py`

Session functionality:

- User-scoped session create/get/end lifecycle.
- Conversation history state, token accounting, and transcript rehydrate integration.
- Runtime containers for screenshot state, system state, resolved tool calls, and pending tool results.
- Runtime config rewiring (provider/model/settings updates) without rebuilding all runtime state.

Execution loop:

- `backend/src/agent/execution/executor.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/policies.py`

Execution functionality:

- Iterative prompt->LLM->parse->tools loop orchestration.
- Parse-recovery and tool-turn policy controls.
- Empty-final-response fallback handling.

Agent LLM adapters:

- `backend/src/agent/llm/conversation_context.py`
- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/llm/token_counting.py`

Agent LLM functionality:

- Iteration-aware prompt-context construction.
- LLM streaming aggregation and event emission.
- Prompt-transparency event path (`system-prompt`, `user-message-full`, `tool-schemas`).
- Token usage + cache diagnostic tracking.

History and tool-output commit:

- `backend/src/agent/history/history_committer.py`

History functionality:

- Post-tool result commit boundaries into conversation history.
- Bundle-aware commit behavior and staged tool-call linkage handling.

## Agent Tool Lifecycle Functionality Inventory

High-level coordinator:

- `backend/src/agent/tools/orchestrator.py`

Phase 1, preparation:

- `backend/src/agent/tools/preparation/preparer.py`
- `backend/src/agent/tools/preparation/types/*.py`
- `backend/src/agent/tools/preparation/storage/resolved_call_storage.py`
- `backend/src/agent/tools/preparation/helpers/*.py`
- `backend/src/agent/tools/preparation/coordinate_resolution/resolvers.py`
- `backend/src/agent/tools/preparation/screenshot/*.py`
- `backend/src/agent/tools/preparation/ocr/coordinator.py`

Preparation functionality:

- Tool-call normalization into execution refs.
- Screenshot availability and OCR result orchestration.
- Coordinate resolution via OCR or vision.
- Immutable resolved-call storage keyed by request id.
- Synthetic failure generation inputs for unresolvable calls.

Phase 2, sending:

- `backend/src/agent/tools/sending/sender.py`

Sending functionality:

- Emit `tool-call` or `tool-bundle` events with correlation metadata.
- Emit synthetic `tool-output` where frontend execution should be skipped.

Phase 3, waiting/ingress:

- `backend/src/agent/tools/waiting/handler.py`
- `backend/src/agent/tools/waiting/receiver.py`
- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`

Waiting functionality:

- Frontend result payload normalization (single and bundle).
- Pending-result and future registry with TTL cleanup.
- Bundle-id and request-id resolution pathways.
- Screenshot extraction/refresh handoff from tool results.

Phase 4, processing:

- `backend/src/agent/tools/processing/coordinator.py`
- `backend/src/agent/tools/processing/processor.py`
- `backend/src/agent/tools/processing/transformer.py`
- `backend/src/agent/tools/processing/synthetic_factory.py`

Processing functionality:

- Tool-result transformation to history-safe output format.
- Commit delegation to history layer.
- Synthetic error output construction for failed preparation/runtime conditions.

Shared helpers:

- `backend/src/agent/tools/shared/bundle_detection.py`
- `backend/src/agent/tools/shared/bundle_result_formatter.py`
- `backend/src/agent/tools/shared/logging_utils.py`

## Core Runtime Functionality Inventory

Core bootstrap + DI:

- `backend/src/core/bootstrap/*.py`
- `backend/src/core/container/*.py`

Core bootstrap/container functionality:

- Startup phase coordination.
- Container composition (`core`, `tool`, `memory`, `api`).
- App/session/runtime dependency resolution.
- Config update propagation to live services.
- Incoming message route-table ownership for handler registry.

Core configuration:

- `backend/src/core/config/*.py`

Configuration functionality:

- Typed config model definitions.
- Runtime normalization policy.
- API-key loading and provider config materialization.
- Config subscriptions and change fan-out.

Core eventing and infra primitives:

- `backend/src/core/events/*.py`
- `backend/src/core/infrastructure/*.py`

Event/infra functionality:

- Internal bus events and stream-event dataclasses.
- Event bus dispatch + caching helpers.
- In-memory cache primitives (TTL/LRU/negative cache behavior).
- Shared exception hierarchy.

Core interfaces, messages, types, validation:

- `backend/src/core/interfaces/*.py`
- `backend/src/core/messages/*.py`
- `backend/src/core/types/*.py`
- `backend/src/core/validation/validators.py`
- `backend/src/core/utils/coordinate_methods.py`

Functionality:

- Protocol boundaries for embedding/tool/vision interfaces.
- Stored-message conversions for LLM payload construction.
- Enum and typed schema definitions used across domains.
- Input validation and frontend patch-allowlist enforcement.

Core security and observability:

- `backend/src/core/security/policy.py`
- `backend/src/core/security/executor.py`
- `backend/src/core/observability/trust_boundary_metrics.py`

Functionality:

- Permission and policy checks around tool execution.
- Execution strategy boundary (direct vs sandboxed executor abstractions).
- Trust-boundary metrics capture and violation tracking.

Core services:

- `backend/src/core/services/agent_factory.py`
- `backend/src/core/services/context_factory.py`
- `backend/src/core/services/tts_service.py`
- `backend/src/core/services/tts_audio.py`
- `backend/src/core/services/tts_buffer.py`
- `backend/src/core/services/tts_cuda.py`
- `backend/src/core/services/tts_worker.py`
- `backend/src/core/services/wakeword_service.py`

Functionality:

- Sub-agent session creation.
- Tool execution context construction.
- TTS synthesis pipeline and worker/runtime helpers.
- Wakeword activation policy and greeting response wiring.

## LLM Stack Functionality Inventory

Modules:

- `backend/src/llm/client.py`
- `backend/src/llm/providers/*.py`
- `backend/src/llm/models/*.py`
- `backend/src/llm/prompts/*.py`
- `backend/src/llm/parser.py`
- `backend/src/llm/parser_extraction.py`
- `backend/src/llm/parser_validation.py`
- `backend/src/llm/parser_types.py`
- `backend/src/llm/request_kwargs.py`

Functionality:

- Provider-agnostic LLM client path with stream and non-stream behavior.
- Provider factory and runtime selection across OpenAI/OpenRouter/Anthropic/Gemini/Mistral/Kimi/local providers.
- Model catalog assembly and dedupe.
- System prompt loading and prompt constructor behavior.
- Tool-call extraction and validation trust boundaries.
- Provider-specific request kwargs (prompt cache keys, transport options).

## Backend Tool Schema + Remote Tool Functionality Inventory

Modules:

- `backend/src/tools/registry.py`
- `backend/src/tools/schema_registry.py`
- `backend/src/tools/schema_fields.py`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/tools/categorization.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/tools/result_helpers.py`
- `backend/src/tools/result_types.py`
- `backend/src/tools/remote.py`
- `backend/src/tools/remote_tools/*.py`
- `backend/src/tools/computer/schemas.py`
- `backend/src/tools/filesystem/schemas.py`
- `backend/src/tools/system/schemas.py`
- `backend/src/tools/browser/*.py`

Functionality:

- Registry of backend-visible remote tool stubs and schema declarations.
- Runtime filtering/policy of tool visibility.
- Single and bundle orchestration helper paths for tool waits/results.
- Canonical schema models for computer/filesystem/system/browser domains.
- Browser compatibility schema fields aligned with frontend sidecar browser runtime.

## Runtime Services Functionality Inventory

Modules:

- `backend/src/services/artifacts/store.py`
- `backend/src/services/token_service.py`
- `backend/src/services/ocr/ocr_service.py`
- `backend/src/services/ocr/helpers.py`
- `backend/src/services/vision/vision_service.py`
- `backend/src/services/vision/coordinates.py`
- `backend/src/services/vision/utils.py`
- `backend/src/services/vision/providers/*.py`

Functionality:

- Artifact upload/storage and lookup by artifact id.
- Token counting with message normalization fallback paths.
- OCR task execution + helper normalization.
- Vision provider inference and coordinate scaling.

## SDK, Embeddings, and Simulation Functionality Inventory

SDK:

- `backend/src/sdk/tool.py`
- `backend/src/sdk/context.py`
- `backend/src/sdk/agents/session_builder.py`
- `backend/src/sdk/agents/response_extractor.py`
- `backend/src/sdk/agents/config_helper.py`

Functionality:

- Backend SDK tool base contracts.
- Tool context/session context interfaces.
- Child/sub-agent session creation + response extraction helpers.

Embeddings:

- `backend/src/embeddings/embeddings.py`

Functionality:

- Sentence-transformer embedding provider implementation.

Simulation:

- `backend/src/simulation/*.py`

Functionality:

- Mock backend app factory and lifespan.
- Mock LLM clients for browser/computer testing paths.
- Native tool adapter compatibility utilities.

## End-to-End Query Path (Code Ownership)

1. WebSocket ingress, parse, and handler dispatch: `api/routes/websocket/*` + `api/infrastructure/*`.
2. Query lifecycle orchestration: `api/handlers/query.py` + `api/services/query_execution.py`.
3. Session executor + interaction loop: `agent/session/session.py` + `agent/execution/*`.
4. LLM invocation/parse: `agent/llm/*` + `llm/*`.
5. Tool lifecycle: `agent/tools/{preparation,sending,waiting,processing}/*` + `tools/*`.
6. Stream formatting and websocket send: `api/processing/*` + `api/transport/*`.
7. Auxiliary services on demand: `services/*` and `api/routes/memory/*` + `api/routes/artifacts.py`.

## Related Docs

- [Backend Functionality Map](README.md)
- [Backend Source Maps Docs Hub](source_maps/README.md)
- [Backend API Docs Hub](api/README.md)
- [Backend Agent Docs Hub](agent/README.md)
- [Backend LLM Docs Hub](llm/README.md)
- [Backend Services Docs Hub](services/README.md)
