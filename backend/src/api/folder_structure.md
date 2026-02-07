# API Layer Folder Structure

## Overview

The API layer handles all client communication, message routing, processing, and transport. The structure reflects the data flow from entry point (routes) through handlers, processing, and finally transport.

---

## Folder Structure

```
backend/src/api/
├── __init__.py                        # Package initialization and exports
├── schema.py                          # Pydantic models for all WebSocket message types (incoming/outgoing)
├── deps.py                            # FastAPI dependency injection (app-lifespan-scoped container access)
│
├── transport/                         # TRANSPORT LAYER - Thread-safe WebSocket communication
│   ├── __init__.py                    # Exports: WebSocketSender, TransportSender, WebSocketTransportSender, SafeWebSocket
│   ├── protocol.py                    # WebSocketSender Protocol - Type-safe interface for WebSocket operations
│   ├── sender.py                      # TransportSender ABC and WebSocketTransportSender - Transport abstraction layer
│   └── websocket.py                   # SafeWebSocket - Thread-safe WebSocket wrapper with queue-based message sending
│
├── infrastructure/                     # INFRASTRUCTURE LAYER - Base classes and utilities
│   ├── __init__.py                    # Exports: MessageHandler, MessageHandlerRegistry, error utilities
│   ├── handler.py                     # MessageHandler - Abstract base class for all message handlers
│   ├── registry.py                    # MessageHandlerRegistry - Routes messages to appropriate handlers by type
│   └── errors.py                      # Error handling utilities - Standardized error responses and sanitization
│
├── routes/                            # ENTRY POINT LAYER - FastAPI route definitions
│   ├── __init__.py                    # Package initialization
│   │
│   ├── websocket/                     # WebSocket routes - Real-time bidirectional communication
│   │   ├── __init__.py                # Main WebSocket endpoint (/ws) and router definition
│   │   ├── connection.py              # Connection lifecycle - Handshake, cleanup, session management
│   │   ├── message_handler.py         # Message parsing/validation - JSON parsing, Pydantic validation, routing
│   │   └── task_manager.py            # Task tracking - Concurrency limits, task cancellation, cleanup
│   │
│   └── memory/                        # Memory-related REST endpoints
│       ├── __init__.py                # Package exports: embeddings, semantic routers
│       ├── embeddings.py              # REST endpoint - Embedding generation (/api/embeddings)
│       └── semantic.py                # REST endpoint - Semantic memory summarization (/api/semantic)
│
├── handlers/                           # HANDLER LAYER - Message type-specific processing
│   ├── __init__.py                    # Exports: All handler classes and base types
│   ├── query.py                       # QueryMessageHandler - Processes user queries, orchestrates agent interaction
│   ├── settings.py                    # ListModelsHandler - Handles model listing requests
│   ├── tool_result.py                 # ToolResultHandler - Routes tool execution results from frontend to AgentSession (delegates processing)
│   └── wakeword.py                    # WakewordHandler - Handles wakeword detection and activation
│
└── processing/                         # PROCESSING LAYER - Event formatting, TTS, and streaming
    ├── __init__.py                    # Exports: StreamPipeline, ResponseFormatter
    │
    ├── pipeline.py                    # StreamPipeline - Orchestrates event processing through composable stages
    ├── formatter.py                   # ResponseFormatter - Main formatter that dispatches to event-specific formatters
    │
    ├── formatters/                     # Event formatters - Individual formatters for each event type
    │   ├── __init__.py                # Exports: All formatter classes
    │   ├── base.py                    # EventFormatter - Abstract base class for all event formatters
    │   ├── chunk.py                   # ChunkEventFormatter - Formats streaming text chunks
    │   ├── thinking.py                # ThinkingEventFormatter - Formats LLM thinking/status events
    │   ├── tool_call.py               # ToolCallEventFormatter - Formats tool call events
    │   ├── tool_output.py             # ToolOutputEventFormatter - Formats tool execution results
    │   ├── error.py                   # ErrorEventFormatter - Formats error events
    │   ├── complete.py                # StreamingCompleteEventFormatter - Formats stream completion events
    │   ├── system_prompt.py           # SystemPromptEventFormatter - Formats system prompt events
    │   ├── tool_schemas.py            # ToolSchemasEventFormatter - Formats tool schema events
    │   ├── user_message.py             # UserMessageFullEventFormatter - Formats full user message events
    │   ├── assistant_message.py       # AssistantMessageFullEventFormatter - Formats full assistant message events
    │   ├── token_count.py             # TokenCountEventFormatter - Formats token usage statistics
    │   ├── screenshot.py              # RequestScreenshotEventFormatter - Formats screenshot request events
    │   ├── memory_store.py            # MemoryStoreEventFormatter - Formats memory storage events
    │   └── tool_bundle.py             # ToolBundleEventFormatter - Formats tool bundle events
    │
    └── tts/                            # Text-to-Speech processing
        ├── __init__.py                # Exports: TTSManager, TTSProcessor
        ├── manager.py                 # TTSManager - Manages TTS service lifecycle (init, streaming, cleanup)
        └── processor.py               # TTSProcessor - Filters code blocks and JSON from TTS output
│
└── query/                              # DEPRECATED - Backward compatibility shim
    └── __init__.py                     # Re-exports from processing/ for backward compatibility
```

---

## Data Flow

### WebSocket Message Flow

```
1. CLIENT CONNECTION
   └─> routes/websocket/__init__.py
       ├─> routes/websocket/connection.py (handshake, user_id extraction)
       └─> routes/websocket/task_manager.py (initialize task tracking)

2. MESSAGE RECEIVED
   └─> routes/websocket/__init__.py (main loop)
       └─> routes/websocket/message_handler.py
           ├─> parse_and_validate_message() (JSON parsing, Pydantic validation)
           └─> handle_message() (route to handler)

3. MESSAGE ROUTING
   └─> infrastructure/registry.py
       └─> MessageHandlerRegistry.handle()
           └─> Routes to appropriate handler based on message.type

4. HANDLER PROCESSING
   ├─> handlers/query.py
   │   ├─> Validates query text
   │   ├─> Gets/creates agent session
   │   ├─> Initializes TTS (if enabled)
   │   ├─> Creates processing pipeline
   │   └─> Streams agent events
   │
   ├─> handlers/tool_result.py
   │   └─> Delegates to AgentSession for tool result processing
   │
   ├─> handlers/settings.py
   │   └─> Returns model list from ModelService
   │
   └─> handlers/wakeword.py
       ├─> Activates voice/speech modes
       └─> Sends greeting with TTS

5. EVENT PROCESSING (for query handler)
   └─> processing/pipeline.py
       ├─> StreamPipeline.process()
       │   ├─> processing/formatter.py
       │   │   └─> ResponseFormatter.format()
       │   │       └─> processing/formatters/*.py (event-specific formatting)
       │   │
       │   ├─> transport/sender.py
       │   │   └─> WebSocketTransportSender.send() (sends formatted message)
       │   │
       │   └─> processing/tts/processor.py (concurrent TTS processing)
       │       └─> processing/tts/manager.py
       │           └─> TTS service (generates audio chunks)
       │               └─> transport/websocket.py
       │                   └─> SafeWebSocket.send_json() (sends audio chunks)

6. TRANSPORT
   └─> transport/websocket.py
       └─> SafeWebSocket (queue-based thread-safe sending)
           └─> FastAPI WebSocket (actual network transmission)
```

### REST Endpoint Flow

```
1. HTTP REQUEST
   └─> routes/memory/semantic.py or routes/memory/embeddings.py

2. DEPENDENCY INJECTION
   └─> deps.py
       └─> get_container() (app-lifespan-scoped container)

3. PROCESSING
   ├─> routes/memory/semantic.py
   │   └─> LLM client (summarization)
   │
   └─> routes/memory/embeddings.py
       └─> Embedding provider (vector generation)

4. RESPONSE
   └─> FastAPI (JSON response)
```

### Error Flow

```
1. ERROR OCCURS (anywhere in the flow)
   └─> infrastructure/errors.py
       ├─> sanitize_error_message() (sanitizes for client)
       └─> send_error_response() (sends standardized error)
           └─> transport/sender.py
               └─> transport/websocket.py (thread-safe send)
```

---

## Key Design Principles

1. **Layered Architecture**: Clear separation between transport, infrastructure, routes, handlers, and processing
2. **Single Responsibility**: Each file has one clear purpose
3. **Data Flow Clarity**: Structure reflects request flow from entry to transport
4. **Thread Safety**: All WebSocket operations go through SafeWebSocket
5. **Type Safety**: Pydantic models ensure message validation at boundaries
6. **Error Handling**: Standardized error responses prevent information leakage
7. **Backward Compatibility**: Old import paths maintained via shim modules

---

## Layer Responsibilities

- **Transport Layer**: Thread-safe WebSocket communication, protocol definitions
- **Infrastructure Layer**: Base classes, registry pattern, error utilities
- **Routes Layer**: Entry points, connection management, message parsing
- **Handlers Layer**: Message type-specific business logic
- **Processing Layer**: Event formatting, TTS processing, streaming pipeline

## Recent Structure Notes

- `routes/websocket/task_manager.py` cleanup now includes a deterministic
  completed-task prune step after cancellation handling, reducing reliance on
  callback timing during disconnect/shutdown paths.
- `routes/websocket/task_manager.py` now closes rejected coroutine inputs when
  concurrency limits are exceeded, preventing un-awaited coroutine warnings in
  route hot paths.
- The same close path is defensive against `close()` exceptions so limit checks
  do not fail request handling on malformed coroutine-like inputs.
- `routes/websocket/message_handler.py` now short-circuits non-object JSON
  payload roots with a deterministic validation error before schema validation.
- `routes/websocket/message_handler.py` uses size-aware JSON parsing:
  small payloads parse inline, while larger payloads are offloaded to the
  executor path to reduce event-loop stalls under heavy message sizes.
- `routes/websocket/connection.py` cleanup path uses a tighter signature that
  only accepts task/session/user dependencies (no unused websocket argument).
- `routes/websocket/task_manager.py` cleanup prune now updates the active task
  set in-place, preserving set identity for callers/tests while removing done
  tasks deterministically.
