# Event System Documentation

## Overview

Desktop Assistant uses a structured event system for both agent streaming (WebSocket communication) and internal component communication (event bus). All events are typed dataclasses for type safety and clarity.

## Event Types

### Agent Streaming Events

Events emitted by the agent during interaction loops and streamed to the frontend:

#### ChunkEvent
Streaming text chunks from LLM.

**Fields**:
- `type`: "chunk"
- `content`: Text chunk content

**Usage**: Real-time text streaming to frontend

#### ThinkingEvent
LLM thinking/reasoning tokens (Gemini models).

**Fields**:
- `type`: "thinking"
- `content`: Thinking token text

**Usage**: Display reasoning process to user

#### ErrorEvent
Error events during agent execution.

**Fields**:
- `type`: "error"
- `content`: Error message
- `details`: Optional error details

**Usage**: Error reporting to frontend

#### StreamingCompleteEvent
End of streaming response.

**Fields**:
- `type`: "streaming-complete"

**Usage**: Signal end of stream to frontend

#### ToolCallEvent
Tool execution request.

**Fields**:
- `type`: "tool_call"
- `tool_name`: Name of tool to execute
- `parameters`: Tool parameters dictionary
- `raw_call`: Raw tool call string
- `request_id`: Optional request ID

**Usage**: Request tool execution from frontend

#### ToolOutputEvent
Tool execution result.

**Fields**:
- `type`: "tool_output"
- `tool_name`: Name of tool that executed
- `result`: Tool result dictionary
- `screenshot`: Optional screenshot data
- `system_context`: Optional system state

**Usage**: Tool execution result from backend

#### ToolBundleEvent
Atomic bundle of tools to execute together.

**Fields**:
- `type`: "tool-bundle"
- `bundle_id`: Bundle identifier
- `tools`: List of tool calls in bundle

**Usage**: Execute multiple tools atomically

#### SystemPromptEvent
System prompt for transparency display.

**Fields**:
- `type`: "system_prompt"
- `content`: System prompt text
- `tool_schemas`: Optional tool schemas

**Usage**: Display system prompt to user (transparency)

#### ToolSchemasEvent
Tool schemas for transparency display.

**Fields**:
- `type`: "tool_schemas"
- `tool_schemas`: Dictionary of tool schemas

**Usage**: Display available tools to user (transparency)

#### UserMessageFullEvent
Full user message for transparency display.

**Fields**:
- `type`: "user_message_full"
- `content`: Full user message with context XML
- `metadata`: Message metadata (has_screenshot, has_memory, etc.)

**Usage**: Display full user message to user (transparency)

#### AssistantMessageFullEvent
Full assistant message for transparency display.

**Fields**:
- `type`: "assistant_message_full"
- `content`: Full assistant response

**Usage**: Display full assistant message to user (transparency)

#### FullResponseEvent
Complete LLM response (after streaming).

**Fields**:
- `type`: "full_response"
- `content`: Complete response text

**Usage**: Final response after streaming completes

#### TokenCountEvent
Token usage information.

**Fields**:
- `type`: "token_count"
- `prompt_tokens`: Input tokens
- `completion_tokens`: Output tokens
- `total_tokens`: Total tokens
- `conversation_tokens`: Conversation history tokens

**Usage**: Display token usage to user

#### RequestScreenshotEvent
Request hidden screenshot for coordinate calculation.

**Fields**:
- `type`: "request-screenshot"
- `request_id`: Request identifier
- `correlation_id`: Correlation identifier

**Usage**: Backend requests screenshot (not displayed in UI)

#### MemoryStoreEvent
Request to store memory.

**Fields**:
- `type`: "memory-store"
- `user_query`: User's query text
- `assistant_response`: Assistant's response
- `memory_type`: "episodic" or "semantic"
- `user_id`: User identifier
- `session_id`: Optional session identifier

**Usage**: Request memory storage

### Event Bus Events

Events for internal component communication via EventBus:

#### InteractionCompleted
Fired when a conversation turn completes.

**Fields**:
- `session_id`: Session identifier
- `query`: User query
- `response`: Assistant response

**Usage**: Trigger memory storage, analytics, cleanup

#### ToolExecuted
Fired when a tool execution completes.

**Fields**:
- `tool_name`: Name of tool
- `result`: ToolResult object
- `execution_time`: Execution time in seconds

**Usage**: Analytics, logging, plugin hooks

#### MemoryStored
Fired when memory is stored.

**Fields**:
- `memory_id`: Memory identifier
- `content`: Memory content
- `memory_type`: Type of memory

**Usage**: Analytics, logging

#### ErrorOccurred
Fired when an error occurs.

**Fields**:
- `error`: Exception object
- `context`: Error context

**Usage**: Error logging, monitoring

## Event Flow

### Agent Streaming Flow

```
Agent Interaction Loop
  ↓
LLMInteractionHandler.get_response()
  ↓
Yields: ChunkEvent, ThinkingEvent, ErrorEvent
  ↓
EventPresenter.present_prompt_metadata()
  ↓
Yields: SystemPromptEvent, UserMessageFullEvent, ToolSchemasEvent
  ↓
ToolExecutor.execute_tools()
  ↓
Yields: ToolCallEvent, ToolBundleEvent
  ↓
ToolResultHandler.process_result()
  ↓
Yields: ToolOutputEvent
  ↓
EventPresenter.present_completion()
  ↓
Yields: StreamingCompleteEvent, TokenCountEvent
```

### Event Bus Flow

```
Component Action
  ↓
EventBus.publish(event)
  ↓
Subscribers Receive Event
  ↓
Subscriber Handlers Execute
```

## Event Bus

### Overview

The EventBus (`core/bus.py`) provides decoupled communication between components.

**Features**:
- **Polymorphism**: Subscribers to parent classes receive child events
- **Thread-Safe**: Lock-protected handler lists
- **Error Recovery**: Configurable error recovery mode
- **Statistics**: Event statistics tracking

### Usage

**Subscribing to Events**:
```python
from backend.src.core.bus import EventBus
from backend.src.core.events import ToolExecuted

event_bus = EventBus()

async def handle_tool_executed(event: ToolExecuted):
    logger.info(f"Tool {event.tool_name} executed in {event.execution_time}s")

event_bus.subscribe(ToolExecuted, handle_tool_executed)
```

**Publishing Events**:
```python
from backend.src.core.events import ToolExecuted

event = ToolExecuted(
    tool_name="mouse_control",
    result=tool_result,
    execution_time=0.5
)
await event_bus.publish(event)
```

**Polymorphism**:
```python
# Subscribing to parent class receives all child events
event_bus.subscribe(StreamingEvent, handle_all_streaming_events)
# Will receive: ChunkEvent, ThinkingEvent, ToolCallEvent, etc.
```

## Event Formatters

### ResponseFormatter (`api/query/formatter.py`)

Formats agent events into WebSocket response messages.

**Event Formatters**:
- `ChunkEventFormatter`: Formats streaming text chunks → `streaming-response`
- `ThinkingEventFormatter`: Formats thinking tokens → `llm-thought`
- `ToolCallEventFormatter`: Formats tool calls → `tool-call`
- `ToolOutputEventFormatter`: Formats tool outputs → `tool-output`
- `ToolBundleEventFormatter`: Formats tool bundles → `tool-bundle`
- `ErrorEventFormatter`: Formats errors → `error`
- `StreamingCompleteEventFormatter`: Formats completion → `streaming-complete`
- `SystemPromptEventFormatter`: Formats system prompt → `system-prompt`
- `TokenCountEventFormatter`: Formats token counts → `token-count`

**Features**:
- O(1) event type lookup using dispatch table
- Validates event structure before formatting
- Returns None for events that should be skipped
- Handles both typed events and dict events

## Stream Pipeline

### Overview

The StreamPipeline (`api/query/pipeline.py`) orchestrates event processing through composable stages.

**Pipeline Stages**:
1. **Format**: Format event to WebSocket message
2. **Transport**: Send message immediately (text appears instantly)
3. **TTS**: Process TTS concurrently (doesn't block text)

**Features**:
- **Stateless**: All per-stream state lives in processors
- **Latency Optimization**: Text sent immediately, TTS runs concurrently
- **TTS Race Fix**: Tracks pending TTS tasks to prevent audio loss
- **Error Isolation**: TTS failure doesn't block text streaming

**Key Methods**:
- `process(event, tts_service, msg_id)`: Process single event through pipeline
- `wait_for_pending_tts()`: Wait for all pending TTS tasks before flush

## Transport Abstractions

### WebSocketSender Protocol

Thread-safe interface for WebSocket operations.

**Methods**:
- `send_json(data, mode)`: Send JSON data safely
- `send_text(data)`: Send text data safely
- `close(code, reason)`: Close connection safely

**Implementations**:
- `SafeWebSocket`: Thread-safe WebSocket wrapper with queue-based sender

### TransportSender

Abstract base class for transport senders (testing seam).

**Implementations**:
- `WebSocketTransportSender`: WebSocket transport implementation

## Error Handling

### Error Utilities (`api/core/errors.py`)

Standardized error handling for WebSocket handlers.

**Functions**:
- `sanitize_error_message(exception, context)`: Sanitize exception message for client
- `send_error_response(websocket, msg_id, message, error_type, exception)`: Send standardized error response
- `send_success_response(websocket, msg_id, response_type, payload)`: Send standardized success response

**Security**:
- All error messages sanitized to prevent information leakage
- Full exception details logged server-side
- Client-facing messages are generic and safe

**Canonical Error Payload**:
```json
{
  "type": "error",
  "id": "<message_id>",
  "payload": {
    "message": "<sanitized_error_message>"
  }
}
```

## Message Handler Registry

### Overview

The MessageHandlerRegistry (`api/core/base.py`) provides centralized message routing.

**Features**:
- Type-based routing to handlers
- Middleware support (runs before all handlers)
- Handler registration/unregistration
- Thread-safe handler access

**Handler Base Class**:
- `MessageHandler`: Abstract base class for all handlers
- `validate_message()`: Optional validation override
- `handle()`: Main handler method

**Usage**:
```python
registry = MessageHandlerRegistry()
registry.register("query", QueryMessageHandler())
registry.register("load-settings", SettingsMessageHandler())

# Route message
await registry.handle("query", message, websocket, user_id)
```

---

For more information, see:
- [API Reference](API_REFERENCE.md)
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
- [Communication Flow](COMMUNICATION_FLOW.md)
