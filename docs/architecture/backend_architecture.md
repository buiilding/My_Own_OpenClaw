---
summary: "Backend Architecture"
read_when:
  - When editing backend services or APIs.
---

# Backend Architecture

See also: [Backend Functionality Map](../backend/README.md) for implementation-level module docs.

## Overview

The backend is built using Python 3.11 with FastAPI, following clean architecture principles. It uses dependency injection, protocol-based interfaces, and service-based extensions (vision/OCR) instead of plugins.

In the intended product topology, the backend is the hosted control plane for WindieOS clients and SDK consumers. It owns cloud or coordinator responsibilities such as:

- OCR and visual grounding
- agent orchestration
- artifact storage and retrieval
- session state and tracing
- hosted REST and WebSocket APIs

The backend is not the local machine executor. Mouse, keyboard, screenshots, browser/runtime control, and local filesystem/process operations stay behind the local-runtime boundary on the user's computer.

The backend resolves the model-visible agent surface per effective user/session
configuration. Registered tools remain process-wide, but prompt schemas,
parser validation, available-tool metadata, and OCR/vision coordinate-method
guidance are narrowed by typed agent capability policy before each agent loop.
This keeps the backend in the control-plane role: policy decides what the
agent may ask for, while local-runtime/provider routes decide where work executes.

Open-source client distributions should assume:

- the SDK calls this backend over HTTP/WebSocket
- the local runtime performs local execution through the current local-runtime Python implementation
- end users are not expected to run backend services themselves just to use OCR, prediction, or hosted agent features

## Core Runtime Refactors (2026-02-11)

To reduce feature-change friction in `backend/src/core`, runtime internals were split into smaller seams:

- **Config assembly is centralized** in `backend/src/core/config/runtime.py` so loader/manager/service paths apply the same runtime policies (API key loading + TTS defaults).
- **Runtime config assembly is now routed through** `backend/src/core/config/loader.py::build_runtime_config()` so `ConfigManager.update_config()` applies the same policy path used during config loading.
- **EventBus internals were extracted** into `backend/src/core/infrastructure/event_bus_registry.py` so handler storage/caching and publish flow evolve independently.
- **TTS internals were modularized** with `backend/src/core/services/tts_cuda.py` and `backend/src/core/services/tts_worker.py` while keeping `TTSService` as the public orchestrator.
- **Container config refresh was hardened** in `backend/src/core/container/config_updater.py` and `backend/src/core/container/facade.py` to avoid stale references and to correctly reinitialize the embedder.
- **Container runtime orchestration is split** into `backend/src/core/container/session_runtime.py` and `backend/src/core/container/api_runtime.py`, with `Container` acting as the runtime facade over `ApplicationContainer`.
- **ApiContainer handler wiring is declarative** in `backend/src/core/container/api_container.py` so adding/removing WebSocket handlers no longer requires repetitive manual registration calls.
- **Incoming message routing is core-owned** in `backend/src/core/container/incoming_routing.py`, and `ApiContainer` now consumes that single route table with schema coverage checks against `IncomingMessage`.
- **Tool schema cache is DI-owned** in `backend/src/tools/schema_registry.py` and `backend/src/tools/registry.py` (no global cache singleton dependency in backend tool schema path).
- **Initialization rollback clears app-lifespan container state** from the coordinator path for safer same-process startup retries.

## Agent Runtime Refactors (2026-02-11)

To reduce feature-change friction in `backend/src/agent`, session and tool-orchestration internals were split into composable seams:

- **Session runtime state is centralized** in `backend/src/agent/session/runtime_state.py` (`SessionRuntimeState`) for screenshots, resolved calls, tool results, and system state.
- **Session config updates are isolated** in `backend/src/agent/session/config_runtime.py` and **cleanup is isolated** in `backend/src/agent/session/lifecycle.py`.
- **Interaction-loop control is centralized** in `backend/src/agent/execution/interaction_loop.py`; the loop owns bundle staging, parse recovery, and termination policy directly.
- **Tool execution metadata is normalized** with `backend/src/agent/tools/preparation/types/execution_ref.py`, then reused by bundle detection and result processing.
- **Screenshot OCR task ownership is explicit** via active-task tracking in screenshot state/manager and wait-side coordination.

## API Runtime Refactors (2026-02-11)

To reduce feature-change friction in `backend/src/api`, WebSocket + semantic API internals were split into smaller seams:

- **Schemas are split by concern** in `backend/src/api/schemas/common.py`, `backend/src/api/schemas/incoming.py`, and `backend/src/api/schemas/outgoing.py`. Backend code imports the first-class schema modules directly; the old compatibility re-export module is gone.
- **Query and wakeword orchestration moved to services** in `backend/src/api/services/query_execution.py` and `backend/src/api/services/wakeword_execution.py`, with shared TTS lifecycle handling in `backend/src/api/services/tts_session.py`.
- **Semantic summarization parsing/orchestration moved out of route handlers** into `backend/src/api/routes/memory/semantic/parser.py` and `backend/src/api/routes/memory/semantic/service.py`, leaving `semantic.py` as a thin HTTP layer.
- **FastAPI dependency resolution is app scoped** in `backend/src/api/deps.py` (`app.state.container` only) so missing lifecycle wiring fails fast instead of falling back to process-global state.
- **WebSocket JSON parse policy is shared** in `backend/src/api/routes/websocket/json_parse.py` so handshake/message parsing uses one threshold policy (inline for small payloads, executor offload for larger payloads) to protect event-loop latency.

## Runtime Surface Notes (2026-03-11)

Current backend runtime wiring also includes:

- **Runs API routes are first-class app routes**: `backend/src/api/routes/__init__.py` registers the concrete runs router beside websocket/artifact/memory routes, so `/api/runs/*` is part of canonical app assembly (`backend/src/api/app_assembly.py`).
- **Hosted memory HTTP routes now emit ingress logs**: `/api/embeddings`, `/api/semantic/summarize`, and `/api/semantic/title` log start/success/failure with request-size metadata and duration so hosted `502` debugging can distinguish tunnel/origin reachability failures from in-app route failures.
- **SDK perception routes are first-class app routes**: `backend/src/api/routes/sdk/router.py` registers direct OCR/text-grounding and vision/prediction APIs under `/api/sdk/*`, exposing backend-owned perception capabilities without routing through the agent loop.
- **SDK perception routes are meant for direct hosted consumption**: clients upload artifacts or send inline images, call `/api/sdk/*`, then combine the returned grounding data with SDK local-runtime actions. They should not need to instantiate backend OCR/vision services locally to use these APIs.
- **SDK OCR observability extends the same OCR surface**: `/api/sdk/ocr/inspect` now bundles raw OCR rows, ranked candidates, resolution outcome, and optional overlay output in one OCR-first SDK call instead of introducing a separate OCR-debug subsystem.
- **SDK introspection now includes first-turn planning**: `/api/sdk/query-plan` reuses the real prompt/tool/transparency pipeline to return a planned `query` envelope plus ordered first-turn transparency events (`system-prompt`, `user-message-full`, `tool-schemas`) without executing the agent loop.
- **SDK introspection routes are first-class app routes**: the same SDK router now exposes developer-facing `/api/sdk/*` introspection APIs for model catalogs, system-prompt inspection, tool-schema snapshots, per-tool capabilities, and prompt previews built from the backend’s real prompt/tool pipeline alongside the perception routes.
- **Agent capability policy is session-scoped and health-aware**: `agent_tool_profile`, `agent_disabled_tools`, `agent_coordinate_methods`, `agent_disabled_capabilities`, and backend-computed `agent_provider_unavailable_capabilities` in the effective `AppConfig` can narrow model-visible tools and OCR/vision coordinate methods per user/session without restarting the backend.
- **Query execution helper split is now structural**: `backend/src/api/services/query_execution_support/*` owns screenshot/input resolution, completion backfill, and cancellation cleanup used by `QueryExecutionService`; the service owns terminal event gating directly.
- **OpenAI native reasoning path is provider-owned**: `backend/src/llm/providers/openai.py` routes reasoning-enabled models through `openai_responses_runtime.py` (`litellm.aresponses`) while non-reasoning models keep the shared online provider path.
- **VM run control service is app-state scoped and in-memory**: `backend/src/api/routes/runs/support.py` lazily creates `VmRunControlService` on `app.state` with optional API-key protection via `x-windie-runs-key`.

## Future: Multi-Tenant Backend & Subscription Platform (Planned)

This section documents the roadmap to move from a single-user/local backend to a **multi-tenant, hosted backend** that serves many users with subscriptions, usage limits, and enterprise controls.

### Goals
- One backend service handles multiple users and devices safely.
- Each user has isolated memory, conversations, tools, and settings.
- Usage is metered and enforced by subscription plan.
- Clear auditability, billing, and security posture for production.

### Required Capabilities

#### 1) Identity, Sessions, and Tenant Isolation
- **Auth**: Email/password + OAuth (Google/GitHub), MFA for paid/enterprise tiers.
- **Sessions**: JWT + refresh tokens, device/session management, secure token rotation.
- **Tenant isolation**: Per-user/tenant IDs in every request; enforce in DB, cache, and memory store.
- **Data encryption**: Encrypt sensitive user data at rest (memories, transcripts, screenshots).

#### 2) Billing & Entitlements
- **Billing provider**: Stripe (or similar) for subscriptions, invoices, taxes.
- **Plans & entitlements**: Map plans to model access, tool permissions, concurrency, and retention.
- **Proration**: Upgrade/downgrade paths and grace periods.
- **Webhook processing**: Reliable billing webhooks to update entitlements and account status.

#### 3) Usage Metering & Limits
- **Usage ledger**: Persist per-request usage events (tokens, tool calls, screenshots, compute time).
- **Rate limits**: Per-user/plan request limits (RPS + burst).
- **Quota limits**: Daily/monthly token budgets, tool execution caps, memory size limits.
- **Soft limits**: Warnings and UI indicators (90% usage).
- **Hard limits**: Request blocking with clear UX error states and upgrade links.

#### 4) Multi-User Backend Routing
- **API gateway**: Auth, rate limiting, request logging, and request normalization.
- **Session service**: Map user sessions to agent sessions with tenant-aware state.
- **Queueing**: Job queue for tool execution or long-running tasks.
- **Horizontal scaling**: Stateless API servers + shared persistent stores.

#### 5) Storage & Retention
- **Primary DB**: Users, plans, subscriptions, usage events, and metadata.
- **Memory store**: Per-tenant memory shards (FAISS or managed vector DB).
- **Conversation storage**: Split hot/cold storage with retention policies.
- **Screenshot storage**: Optional storage policy, encryption, and TTL cleanup.

#### 6) Compliance & Security
- **Audit logs**: Who executed what tool, when, and what data was accessed.
- **PII handling**: Redaction pipeline and user-controlled deletion.
- **Access controls**: Admin console for support and plan changes.
- **Abuse prevention**: Rate limits + anomaly detection for tool misuse.

### Suggested Architecture Additions
- `api/auth/` for auth endpoints and token issuance.
- `billing/` domain for Stripe integration and entitlements.
- `usage/` domain for metering + limits.
- `tenancy/` domain for per-tenant data isolation and access rules.
- `admin/` routes for internal support tooling.

### Milestones (Proposed)
1. **Auth + user table + session tokens**
2. **Usage ledger + basic rate limits**
3. **Stripe subscription flow + entitlements**
4. **Plan-based feature gating**
5. **Compliance + audit logging**

## Directory Structure

```
backend/src/
├── agent/             # Agent domain (sessions, execution, tools, history)
│   ├── session/       # AgentSession, SessionManager, ConversationHistory
│   ├── execution/     # AgentExecutor, InteractionLoop
│   ├── llm/           # LLM streaming + event presentation
│   ├── tools/         # Tool lifecycle (prepare/send/wait/process)
│   └── history/       # HistoryCommitter
├── api/               # API layer (routes, handlers, processing, transport)
├── core/              # Core infrastructure (bootstrap, config, container, events, security, validation)
├── embeddings/        # Embedding provider domain
├── llm/               # LLM domain (client, prompts, providers)
├── services/          # Runtime services (vision, OCR, token counting)
├── tools/             # Tool registry + built-in tool stubs
├── sdk/               # SDK for tool development
├── simulation/        # Mock LLM and simulation helpers
└── main.py            # Application entry point
```

## Core Components

### Agent System

#### AgentSession (`agent/session/session.py`)

The main agent class for orchestrating tasks with tool support.

**Responsibilities**:
- Manage conversation history and context
- Coordinate LLM interactions with tool calls
- Stream responses back to clients
- Persist conversation memory
- Handle session lifecycle events
- Use centralized tool result storage

**Key Methods**:
- `process_query()`: Process user query and yield events
- `update_config()`: Update configuration at runtime
- `get_screenshot()`: Get current screenshot
- `get_current_screenshot_id()`: Get screenshot ID

**Tool Result Storage**:
- Uses centralized `ToolResultStorage` class for managing pending results
- Automatic TTL-based cleanup (5 minutes) to prevent memory leaks
- Weak references for futures to allow garbage collection

#### AgentExecutor (`agent/execution/executor.py`)

Orchestrates the execution of agent interactions.

**Responsibilities**:
- Format user messages with context
- Process user message screenshots
- Run interaction loop
- Handle errors and cleanup

**Key Methods**:
- `process_query()`: Main entry point for query processing
- `_is_first_user_message()`: Check if first message

#### InteractionLoop (`agent/execution/interaction_loop.py`)

Main interaction loop for agent reasoning.

**Responsibilities**:
- Run agent reasoning loop
- Handle tool calls and results
- Manage conversation state
- Stream events to clients

**Key Methods**:
- `run_loop()`: Main interaction loop
- `_handle_tool_results()`: Process tool execution results

#### ToolResultStorage (`agent/tools/waiting/storage/result_storage.py`)

Centralized storage for tool execution results.

**Responsibilities**:
- Manage pending tool results
- Manage tool result futures for async waiting
- Manage bundled results
- Automatic TTL-based cleanup (5 minutes default)
- Memory leak prevention with weak references

**Key Methods**:
- `store_pending_result()`: Store pending result
- `get_pending_result()`: Retrieve pending result
- `create_result_future()`: Create future for async waiting
- `set_result()`: Set result and resolve future
- `store_bundled_result()`: Store bundled result
- `cleanup_old_results()`: Clean up expired results

**Performance Features**:
- Weak references for futures to allow garbage collection
- Automatic cleanup prevents memory leaks in long-running sessions
- Single source of truth for all tool result storage

### Tool System

#### ToolRegistry (`tools/registry.py`)

Registry for managing tools in WindieOS.

**Responsibilities**:
- Register and manage tool instances
- Provide canonical tool schemas for the LLM (`tools` request param + transparency event)
- Manage remote tool stubs
- Create tool execution contexts

**Key Methods**:
- `register_tool()`: Register a tool
- `get_tool()`: Get tool by name
- `get_all_tool_schemas()`: Get all tool schemas
- `create_context()`: Create execution context

#### ToolResultOrchestrator (`tools/orchestrator.py`)

Orchestrates tool execution requests by waiting for SDK-submitted local-runtime tool results.

**Responsibilities**:
- Wait for local-runtime tool results (single tools and bundles)
- Assemble tool result objects for agent processing

**Key Methods**:
- `execute_tools_from_response()`: Execute tools from parsed response

#### ToolPreparer (`agent/tools/preparation/preparer.py`)

Prepares tool calls for execution by resolving coordinates and rewriting arguments.

**Responsibilities**:
- Ensure screenshots are available
- Coordinate OCR and vision resolution
- Resolve coordinates for visual tools
- Attach request_id/bundle_id metadata
- Produce `ResolvedToolCall` instances

**Key Methods**:
- `prepare()`: Prepare and resolve tool calls into a `PreparationResult`
- `_needs_coordinate_resolution()`: Decide if a tool call needs coordinates

### LLM System

#### LLMClient (`llm/client.py`)

Abstraction layer for communicating with LLM providers.

**Responsibilities**:
- Provide unified interface for LLM interactions
- Handle streaming responses
- Manage provider instances
- Handle errors and retries

**Key Methods**:
- `get_completion()`: Get non-streaming completion
- `get_completion_stream()`: Get streaming completion

#### ResponseParser (`llm/parser.py`)

Parses LLM responses and extracts tool calls.

**Responsibilities**:
- Parse LLM response text
- Extract tool calls
- Validate tool call schemas
- Handle parsing errors

**Structure**:
- `llm/parser.py`: ResponseParser trust-boundary parser
- `llm/parser_types.py`: ParsedToolCall / ParsedResponse / ToolCallSchema
- `llm/parser_validation.py`: ToolCallValidator
- `llm/parser_extraction.py`: JSON extraction + removal helpers

**Key Methods**:
- `parse_response()`: Parse LLM response

#### PromptConstructor (`llm/prompts/prompt_constructor.py`)

Constructs prompts for LLM interactions.

**Responsibilities**:
- Load system prompts
- Enforce security limits at the prompt boundary
- Build provider-bound prompt messages and native tool-schema request params
- Emit prompt metadata for transparency events

**Key Methods**:
- `build_provider_prompt()`: Build LLM messages + tool schemas + prompt metadata
- `_calculate_message_size()`: Enforce size limits

### Observability

#### Trust Boundary Metrics (`core/observability/trust_boundary_metrics.py`)

Tracks parser/prompt trust-boundary violations for size, timeout, and validation checks.

**Performance and safety details**:
- Metrics history is bounded in memory (ring-buffer style) to avoid unbounded growth in long-running sessions.
- `get_stats()` computes aggregates from a recent sample window and minimizes lock hold time by snapshotting first.

### Embedding Service

#### SentenceTransformerProvider (`embeddings/embeddings.py`)

Converts text to vector representations (used by `/api/embeddings`).

**Responsibilities**:
- Encode text to embeddings
- Batch encoding for efficiency
- Cache embeddings (via CacheManager)
- Optional GPU acceleration (device is configurable)

**Key Methods**:
- `embed_text()`: Encode a single string
- `embed_batch()`: Encode a list of strings

### Conversation History

#### ConversationHistory (`agent/session/state.py`)

Manages conversation history with automatic pruning and performance optimizations.

**Responsibilities**:
- Store conversation messages in structured format
- Maintain cached LLM format for O(1) retrieval
- Automatic pruning to prevent context window overflow
- Memory DoS protection (image data cleared after 5 turns)

**Key Methods**:
- `add_user_message()`: Add user message with context
- `add_tool_output()`: Add tool execution result
- `add_assistant_message()`: Add assistant response
- `get_llm_history()`: Get history in LLM format (O(1) access)
- `get_token_count()`: Get approximate token count

**Performance Optimizations**:
- **O(1) LLM Format Access**: Cached conversion instead of O(n) iteration
- **Incremental Updates**: LLM cache updated incrementally when messages added
- **Shallow Copy API**: Optional API for direct access without deep copying
- **Memory Protection**: Image data automatically cleared from old messages

### API Layer

#### WebSocket Routes (`api/routes/websocket/`)

Handles WebSocket connections.

**Responsibilities**:
- Manage WebSocket connections
- Route messages to handlers
- Handle connection lifecycle
- Thread-safe message sending

**Key Classes**:
- `SafeWebSocket`: Thread-safe WebSocket wrapper

#### Message Handlers (`api/handlers/`)

Process different message types.

**Handlers**:
- `QueryMessageHandler`: Process user queries (`api/handlers/query.py`)
- `ListModelsHandler`: Return model list (`api/handlers/settings.py`)
- `ToolResultHandler`: Process tool execution results (`api/handlers/tool_result.py`)
- `WakewordHandler`: Handle wakeword activation (`api/handlers/wakeword.py`)

### Configuration System

#### ConfigManager (`core/config/manager.py`)

Manages application configuration.

**Responsibilities**:
- Load configuration from file
- Provide immutable configuration access
- Update config in memory (runtime only)
- Reload config from `app_config.py`

**Key Methods**:
- `load_config()`: Load configuration (once at startup)
- `get_config()`: Get current config (immutable `AppConfig`)
- `update_config()`: Update config in memory (not persisted)
- `reload_config()`: Reload from `app_config.py`

### Bootstrap System

#### InitializationCoordinator (`core/bootstrap/coordinator.py`)

Coordinates application initialization.

**Responsibilities**:
- Initialize all components in phases
- Handle initialization errors
- Provide rollback on failure
- Thread-safe initialization

**Initialization Phases**:
1. Configuration loading
2. Container setup
3. Service initialization (session manager + handlers)
4. Final validation

## Dependency Injection

The backend uses `dependency-injector` with a composed container:

```python
ApplicationContainer
├── CoreContainer
│   ├── ConfigManager / ConfigurationService
│   ├── LLMClient
│   ├── TTSService
│   ├── VisionService / OcrService
│   ├── ModelService
│   ├── MetricsService
│   └── EventBus
├── ToolContainer
│   ├── ToolRegistry
│   ├── ToolResultOrchestrator
│   └── AgentFactory
├── MemoryContainer
│   └── EmbeddingProvider
└── (ApiContainer created lazily in `core/container/facade.py`)
    ├── MessageHandlerRegistry
    └── WebSocket handlers
```

**Container Setup**:
- `core/container/application.py`: container composition
- `core/container/facade.py`: runtime facade and lazy session manager

## Event System

### Event Bus (`core/infrastructure/bus.py`)

Central event bus for internal component communication.

**Bus Events** (`core/events/bus_events.py`):
- `InteractionCompleted`
- `ConfigChanged`

**Streaming Events** (`core/events/streaming_events.py`):
- `ThinkingEvent`, `ChunkEvent`, `ToolCallEvent`, `ToolOutputEvent`
- `StreamingCompleteEvent`, `ErrorEvent`, etc.

**Usage**:
```python
await event_bus.publish(InteractionCompleted(...))
```

## Service Layer

### VisionService (`services/vision/vision_service.py`)

Manages UI grounding models (InternVL/UI-Venus) and handles async initialization/unload.

### OcrService (`services/ocr/ocr_service.py`)

Provides RapidOCR-backed OCR with CUDA/CPU fallback and tuned runtime params.

### TokenService (`services/token_service.py`)

Counts tokens for message batches via LiteLLM with a safe fallback estimator.

## Error Handling

### Exception Hierarchy

```
BaseException
├── BaseAppError
│   ├── LLMError
│   │   ├── LLMAPIError
│   │   └── LLMRateLimitError
│   ├── InputSizeLimitError
│   ├── ParseTimeoutError
│   └── ParseValidationError
```

### Error Handling Flow

1. Error occurs in component
2. Caught and wrapped in domain exception
3. Logged with context
4. Sanitized message sent to SDK/renderer consumers
5. User-friendly error displayed

## Security

### Tool Execution Security

- **Permission Model**: `SecurityPolicy` defines permissions, not enforced in the local-runtime Python implementation by default
- **Sandboxing**: No executor abstraction is exposed; add a concrete isolated execution boundary only with an implemented strategy
- **Resource Limits**: Defined in `SecurityPolicy`, not enforced in the local-runtime Python implementation by default
- **Audit Logging**: Policy supports audit logs; wire-in is required for enforcement

### Data Security

- **Local Memory Storage**: Conversation history and memory stored locally through SDK local-runtime memory backed by local-runtime Python modules
- **LLM API Access**: User input and screenshots sent to LLM providers via internet APIs (required for AI functionality)
- **Encryption**: No encryption-at-rest by default; rely on OS disk encryption for local data
- **Access Control**: User-based isolation
- **No Cloud Sync**: Memory and conversation data are not synced to cloud services

## Performance Optimizations

### Caching

- **LLM Client Caching**: Provider instances cached
- **Embedding Cache**: Avoid re-computing embeddings
- **Tool Schema Cache**: Cached tool definitions
- **Conversation History Cache**: O(1) LLM format access via cached conversion
- **Tool Result Storage**: Centralized storage with TTL-based cleanup

### Parallelization

- **Async I/O**: All I/O operations async
- **Parallel Tool Execution**: Multiple tools in parallel
- **Batch Processing**: Batch embeddings and OCR
- **Thread Pool**: Global thread pool for blocking operations

### GPU Acceleration (Optional)

- **CUDA Support**: Embeddings can use GPU when configured
- **OCR Acceleration**: OCR can leverage GPU when available
- **Vision Models**: Vision inference can use GPU when available

## Testing

### Test Structure

```
tests/backend/
├── test_llm_client.py
├── test_interaction_loop.py
├── test_tool_result_orchestrator.py
└── test_websocket_message_handler.py
```

### Testing Strategy

- **Unit Tests**: Individual components
- **Integration Tests**: Component interactions
- **Mocking**: External dependencies mocked

## Extension Points

### Tool Development

1. Inherit from `Tool` base class (`sdk/tool.py`)
2. Implement `execute()` method
3. Register in tool registry

### Vision Provider

1. Add provider under `services/vision/providers/`
2. Wire selection logic in `services/vision/vision_service.py`

### Custom LLM Provider

1. Implement `LLMProvider` interface
2. Register in provider factory
3. Configure in app config

---

For more detailed information, see:
- [Tool System](tool_system.md)
- [LLM Integration](llm_integration.md)
- [Memory System](memory_system.md)
