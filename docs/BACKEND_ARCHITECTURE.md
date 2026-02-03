---
summary: "Backend Architecture"
read_when:
  - When editing backend services or APIs.
---

# Backend Architecture

## Overview

The backend is built using Python 3.9+ with FastAPI, following clean architecture principles. It uses dependency injection, protocol-based interfaces, and a plugin system for extensibility.

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
├── agent/              # Agent domain (core intelligence)
│   ├── session/        # AgentSession, SessionManager, ConversationHistory
│   ├── execution/      # AgentExecutor, InteractionLoop
│   ├── llm/            # LLM streaming + event presentation
│   ├── tools/          # Tool lifecycle (prepare/send/wait/process)
│   ├── history/        # HistoryCommitter
│   └── plugins/        # Plugin system (OCR, etc.)
├── tools/             # Tools domain (registry, loader, tools)
│   ├── registry.py   # ToolRegistry
│   ├── orchestrator.py  # ToolResultOrchestrator
│   ├── remote.py     # Remote tool stubs
│   └── schema_registry.py  # Tool schema management
├── embeddings/        # Embedding provider domain
│   └── embeddings.py # SentenceTransformerProvider
├── llm/               # LLM domain (client, prompts)
│   ├── client.py     # LLMClient abstraction
│   ├── parser.py     # ResponseParser (facade)
│   ├── parser_types.py  # ParsedToolCall / ParsedResponse / ToolCallSchema
│   ├── parser_validation.py  # ToolCallValidator
│   ├── parser_extraction.py  # JSON extraction + removal helpers
│   ├── prompts/      # Prompt construction
│   └── providers/   # LLM provider implementations
├── api/               # API layer (routes, dependencies)
│   ├── routes/       # FastAPI routes
│   ├── handlers/     # Message handlers
│   ├── schema.py     # Pydantic models
│   └── deps.py       # Dependency injection
├── core/              # Core infrastructure
│   ├── container/     # DI containers (application, facade, factories)
│   ├── config/        # Configuration management (app_config.py, loader.py, models.py)
│   ├── bootstrap/     # System initialization
│   ├── plugins/       # Plugin registry
│   ├── services/      # Core services
│   │   ├── tts_service.py   # TTSService (Piper integration)
│   │   ├── tts_buffer.py    # SentenceBuffer
│   │   └── tts_audio.py     # Audio chunk helpers
│   ├── infrastructure/  # Shared infra (cache, bus, etc.)
│   │   ├── cache.py         # Cache facade
│   │   ├── cache_entry.py   # CacheEntry
│   │   ├── cache_store.py   # Cache implementation
│   │   └── cache_manager.py # CacheManager
│   └── interfaces/    # Protocol interfaces
├── sdk/               # SDK for tool development
│   ├── tool.py        # Base Tool class
│   ├── context.py     # Context classes
│   └── errors.py      # SDK exceptions
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

Registry for managing tools in the Desktop Assistant.

**Responsibilities**:
- Register and manage tool instances
- Provide tool schemas for the LLM (embedded in the initial user message + transparency event)
- Manage remote tool stubs
- Create tool execution contexts

**Key Methods**:
- `register_tool()`: Register a tool
- `get_tool()`: Get tool by name
- `get_all_tool_schemas()`: Get all tool schemas
- `create_context()`: Create execution context

#### ToolResultOrchestrator (`tools/orchestrator.py`)

Orchestrates tool execution requests by waiting for frontend tool results.

**Responsibilities**:
- Wait for frontend tool results (single tools and bundles)
- Assemble tool result objects for agent processing
- Provide available tool metadata for inspection

**Key Methods**:
- `execute_tools_from_response()`: Execute tools from parsed response
- `get_available_tools()`: Return tool capability metadata

#### ToolPreparer (`agent/tools/preparation/preparer.py`)

Prepares tool calls for execution.

**Responsibilities**:
- Ensure screenshots are available
- Coordinate OCR processing
- Resolve coordinates for visual tools
- Prepare tool calls with metadata
- Use shallow copy optimization for PreparedToolCall creation

**Key Methods**:
- `prepare_tool_calls()`: Prepare tool calls from parsed response
- `_ensure_screenshot()`: Ensure screenshot is available
- `_resolve_coordinates()`: Resolve coordinates for tools

**Performance Optimizations**:
- Shallow copy instead of deep copy for PreparedToolCall parameters
- Parameters are typically simple values (str, int, bool, float)
- Reduces overhead per tool call, especially in multi-tool scenarios

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
- `llm/parser.py`: ResponseParser facade
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
- Build message history and embed tool schema payloads in the initial user message
- Emit prompt metadata for transparency events

**Key Methods**:
- `build_prompt()`: Build LLM messages + tool schema metadata (schemas live in first user message)
- `_calculate_message_size()`: Enforce size limits

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
3. Service initialization
4. Plugin loading

## Dependency Injection

The backend uses `dependency-injector` with a composed container:

```python
ApplicationContainer
├── CoreContainer
│   ├── ConfigManager / ConfigurationService
│   ├── LLMClient
│   ├── TTSService
│   ├── VisionService
│   └── EventBus
├── ToolContainer
│   ├── ToolRegistry
│   ├── ToolResultOrchestrator
│   └── AgentFactory
├── MemoryContainer
│   └── EmbeddingProvider
└── ApiContainer
    ├── MessageHandlerRegistry
    └── WebSocket handlers
```

**Container Setup**:
- `core/container/application.py`: container composition
- `core/container/facade.py`: backward-compatible facade and lazy session manager

## Event System

### Event Bus (`core/infrastructure/bus.py`)

Central event bus for internal component communication.

**Bus Events** (`core/events/bus_events.py`):
- `InteractionCompleted`
- `ConfigChanged`

**Streaming Events** (`core/events/streaming_events.py`):
- `ThinkingEvent`, `ChunkEvent`, `ToolCallEvent`, `ToolOutputEvent`
- `MemoryStoreEvent`, `StreamingCompleteEvent`, `ErrorEvent`, etc.

**Usage**:
```python
await event_bus.publish(InteractionCompleted(...))
```

## Plugin System

### Plugin Registry (`core/plugins/registry.py`)

Manages plugin lifecycle.

**Responsibilities**:
- Register plugins
- Initialize plugins
- Shutdown plugins
- Execute tool-end hooks via PluginManager

**Built-in Plugins**:
- `OCRPlugin`: OCR processing plugin

### Plugin Interface (`agent/plugins/interface.py`)

Base interface for plugins.

**Methods**:
- `initialize(container=None)`: Initialize plugin (optional)
- `on_tool_end(tool_name, result)`: Hook after tool execution
- `shutdown()`: Cleanup (optional)

## Error Handling

### Exception Hierarchy

```
BaseException
├── BaseAppError
│   ├── ConfigurationError
│   ├── LLMError
│   │   ├── LLMAPIError
│   │   └── LLMRateLimitError
│   ├── ToolExecutionError
│   │   ├── ToolValidationError
│   │   └── ToolNotFoundError
│   ├── MemoryError
│   │   ├── MemoryStoreError
│   │   └── EmbeddingError
│   ├── SessionError
│   ├── InputSizeLimitError
│   ├── ParseTimeoutError
│   └── ParseValidationError
```

### Error Handling Flow

1. Error occurs in component
2. Caught and wrapped in domain exception
3. Logged with context
4. Sanitized message sent to frontend
5. User-friendly error displayed

## Security

### Tool Execution Security

- **Permission Model**: `SecurityPolicy` defines permissions, not enforced in sidecar by default
- **Sandbox Hooks**: Executor abstraction enables sandboxing (not enabled by default)
- **Resource Limits**: Defined in `SecurityPolicy`, not enforced in sidecar by default
- **Audit Logging**: Policy supports audit logs; wire-in is required for enforcement

### Data Security

- **Local Memory Storage**: Conversation history and memory stored locally via the Python sidecar
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
├── test_agent_system.py
├── test_tool_execution.py
├── test_llm_integration.py
└── test_parser_helpers.py
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

### Plugin Development

1. Implement `Plugin` interface
2. Register in plugin registry
3. Handle events from event bus

### Custom LLM Provider

1. Implement `LLMProvider` interface
2. Register in provider factory
3. Configure in app config

---

For more detailed information, see:
- [Tool System](TOOL_SYSTEM.md)
- [LLM Integration](LLM_INTEGRATION.md)
- [Memory System](MEMORY_SYSTEM.md)
- [Plugin System](PLUGIN_SYSTEM.md)
