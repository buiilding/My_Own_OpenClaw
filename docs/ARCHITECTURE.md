# System Architecture

## Overview

Desktop Assistant is built as a distributed system with a clear separation between frontend (Electron/React) and backend (Python/FastAPI). The architecture follows clean architecture principles with dependency injection, protocol-based interfaces, and a plugin system for extensibility.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Frontend                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Renderer Process (React)                          │  │
│  │  - ChatInterface                                     │  │
│  │  - SettingsPanel                                    │  │
│  │  - MessageList                                       │  │
│  │  - Context Providers (AppContext, ChatContext)      │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕ IPC                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Main Process (Node.js)                              │  │
│  │  - IPC Bridge (ipc.cjs)                              │  │
│  │  - WebSocket Client                                  │  │
│  │  - Wakeword Bridge                                    │  │
│  │  - Python Sidecar (runner.py)                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕ WebSocket
┌─────────────────────────────────────────────────────────────┐
│                  Python Backend (FastAPI)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  API Layer                                            │  │
│  │  - WebSocket Routes                                   │  │
│  │  - Message Handlers                                   │  │
│  │  - Schema Validation                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Agent System                                         │  │
│  │  - AgentSession                                       │  │
│  │  - AgentExecutor                                      │  │
│  │  - InteractionLoop                                    │  │
│  │  - Tool Preparation & Execution                      │  │
│  └──────────────────────────────────────────────────────┘  │
│   ↕          ↕          ↕           ↕          ↕          │
│ ┌─────┐  ┌────────┐  ┌──────┐  ┌──────────┐  ┌────────┐ │
│ │Memory│  │Tools  │  │ LLM  │  │ Plugins  │  │ Vision  │ │
│ │System│  │System │  │Client│  │ Registry │  │Service  │ │
│ └─────┘  └────────┘  └──────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Architecture

#### Renderer Process (React)
- **Components**: React components for UI rendering
- **Context**: Global state management (AppContext, ChatContext)
- **Hooks**: Custom hooks for streaming, voice, wakeword, audio
- **API Client**: Typed API client for backend communication

#### Main Process (Node.js)
- **IPC Bridge**: Secure communication between renderer and main
- **WebSocket Client**: Connection to Python backend
- **Wakeword Bridge**: Python subprocess management for wakeword detection
- **Python Sidecar**: Tool execution and system state capture

### Backend Architecture

#### API Layer
- **Routes**: FastAPI route definitions (WebSocket, REST)
- **Handlers**: Message handlers for different message types
- **Schema**: Pydantic models for validation
- **Dependencies**: Dependency injection setup

#### Agent System
- **AgentSession**: Core agent state and conversation management
- **AgentExecutor**: Orchestrates query processing and tool execution
- **InteractionLoop**: Main interaction loop for agent reasoning
- **Tool Preparation**: Coordinate resolution and tool call preparation

#### Core Systems
- **Memory System**: Semantic and episodic memory with FAISS
- **Tool System**: Tool registry and orchestration
- **LLM Client**: Multi-provider LLM abstraction
- **Plugin System**: Extensible plugin architecture
- **Vision Service**: AI-powered visual understanding

## Data Flow

### User Query Flow

```
1. User types message in UI
   ↓
2. Frontend captures screenshot (always, for visual context)
   ↓
3. Message sent via IPC → Main Process
   ↓
4. Main Process → WebSocket → Backend
   ↓
5. Backend validates message (schema.py)
   ↓
6. Message routed to QueryHandler
   ↓
7. AgentSession.process_query()
   ↓
8. PromptConstructor formats message
   ↓
9. LLM generates response with tool calls
   ↓
10. ToolPreparer prepares tool calls
    ↓
11. Tools sent to frontend for execution
    ↓
12. Frontend executes tools (Python sidecar)
    ↓
13. Results sent back to backend
    ↓
14. ToolResultHandler processes results
    ↓
15. Agent continues or completes
    ↓
16. Response streamed back to frontend
    ↓
17. UI updates in real-time
```

### Screenshot Capture Strategy

Screenshots are captured strategically at key points to provide visual context for AI decision-making. The system captures screenshots in the following scenarios:

#### User Message Screenshots
- **Timing**: Captured for every user message
- **Purpose**: Provides initial visual context showing the current screen state before any AI action
- **Location**: `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- **Storage**: Included in user query payload sent to backend

#### Tool Result Screenshots
- **Timing**: Automatically captured after computer-use tool execution (mouse_control, keyboard_control, scroll_control, etc.)
- **Purpose**: Shows the result state after tool execution for verification and continued context
- **Location**: `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- **Storage**: Attached to tool result data sent back to backend

#### LLM-Requested Screenshots
- **Timing**: When the LLM explicitly calls the `screenshot` tool
- **Purpose**: AI-driven capture when the model determines it needs current visual information
- **Location**: Standard tool execution flow
- **Storage**: Returned as tool result data

#### Hidden Screenshots
- **Timing**: Requested by backend when preparing coordinate-based tools that need visual context
- **Purpose**: Ensures up-to-date screenshot is available before coordinate resolution
- **Location**: `backend/src/agent/tools/screenshot_manager.py`
- **Storage**: Stored in session state for tool preparation

**Important**: Screenshots are NOT captured continuously or on a timer - they are only taken when explicitly requested by the system or when providing context for user/AI interactions. This balances the need for visual context with performance considerations.

### Tool Execution Flow

```
1. LLM generates tool call
   ↓
2. ToolPreparer checks if screenshot needed
   ↓
3. ScreenshotManager acquires screenshot
   ↓
4. OCRCoordinator runs OCR (if needed)
   ↓
5. CoordinateResolver resolves coordinates
   ↓
6. Tool call prepared with coordinates
   ↓
7. Tool sent to frontend via WebSocket
   ↓
8. Frontend dispatches to Python sidecar
   ↓
9. Python sidecar executes tool
   ↓
10. Result captured with screenshot
    ↓
11. Result sent back to backend
    ↓
12. ToolResultHandler processes result
    ↓
13. Result added to conversation history
    ↓
14. Agent continues with next step
```

## Communication Protocols

### WebSocket Protocol

**Message Format**:
```json
{
  "id": "uuid-v4",
  "type": "query|load-settings|update-settings|...",
  "payload": { ... },
  "timestamp": "ISO-8601"
}
```

**Message Types**:
- `query`: User query with optional screenshot
- `load-settings`: Request current settings
- `update-settings`: Update configuration
- `list-models`: Request available models
- `tool-result`: Tool execution result from frontend

**Response Types**:
- `streaming-response`: Streaming text chunks
- `tool-call`: Tool execution request
- `tool-output`: Tool execution result
- `llm-thought`: Thinking tokens (Gemini)
- `error`: Error response
- `streaming-complete`: End of stream

### IPC Protocol (Electron)

**Channels**:
- `to-backend`: Renderer → Main → Backend
- `from-backend`: Backend → Main → Renderer
- `ipc-status`: Connection status
- `wakeword-audio-chunk`: Audio data for wakeword
- `wakeword-detected`: Wakeword detection event

## Dependency Injection

The backend uses `dependency-injector` for clean architecture:

```python
Container
├── ConfigManager
├── ToolRegistry
├── LLMClient
├── MemoryManager
├── PluginRegistry
└── SessionManager
    └── AgentSession
        ├── AgentExecutor
        ├── ToolOrchestrator
        └── PromptConstructor
```

## Plugin System

Plugins extend functionality without modifying core code:

```
PluginRegistry
├── OCRPlugin (built-in)
├── CustomPlugin1
└── CustomPlugin2
```

**Plugin Interface**:
- `initialize()`: Setup plugin
- `shutdown()`: Cleanup
- `handle_event()`: Process events

## Security Architecture

### Tool Execution Security
- **Permission System**: Tools require explicit permissions
- **Sandboxing**: Isolated execution environment
- **Resource Limits**: CPU, memory, and time limits
- **Audit Logging**: All tool executions logged

### Data Security
- **Local Memory Storage**: Conversation history and memory stored and searched locally
- **LLM API Access**: User input and screenshots sent to LLM providers via internet APIs (required for AI functionality)
- **Encryption**: Sensitive data encrypted at rest
- **Access Control**: User-based isolation
- **No Cloud Sync**: Memory and conversation data are not synced to cloud services

## Performance Optimizations

### Caching
- **LLM Client Caching**: Provider instances cached
- **Embedding Cache**: Avoid re-computing embeddings
- **Tool Schema Cache**: Cached tool definitions
- **Query Result Cache**: Frequent queries cached

### Parallelization
- **Async I/O**: All I/O operations async
- **Parallel Tool Execution**: Multiple tools in parallel
- **Batch Processing**: Batch embeddings and OCR
- **Thread Pool**: Global thread pool for blocking operations

### GPU Acceleration
- **CUDA Support**: GPU-accelerated embeddings
- **OCR Acceleration**: GPU-accelerated OCR processing
- **Vision Models**: GPU-accelerated vision inference

## Error Handling

### Error Hierarchy
```
BaseException
├── DesktopAssistantException
│   ├── LLMAPIError
│   ├── ToolExecutionError
│   ├── ConfigurationError
│   └── ValidationError
```

### Error Flow
1. Error occurs in component
2. Caught and wrapped in domain exception
3. Logged with context
4. Sanitized message sent to frontend
5. User-friendly error displayed

## Extension Points

### Tool Development
- Inherit from `Tool` base class
- Implement `execute()` method
- Register in tool registry

### Plugin Development
- Implement `Plugin` interface
- Register in plugin registry
- Handle events from event bus

### Custom LLM Provider
- Implement `LLMProvider` interface
- Register in provider factory
- Configure in app config

## Scalability Considerations

### Current Limitations
- Single-user sessions (per WebSocket connection)
- Local storage only
- Single-machine execution

### Future Scalability

> **Note**: The capabilities described below are **planned features** that have not yet been implemented. They represent our strategic vision for future architectural enhancements.

#### Multi-Agent Orchestration (Planned - Strategic Priority)
The future architecture would be designed to support **multi-agent orchestration across machines** - a capability that would be extremely difficult to replicate and represents a core competitive advantage:

- **Distributed Agent Coordination**: Multiple assistants working in parallel across different machines with intelligent task distribution (planned)
- **Cross-Machine Workflows**: Agents coordinating to handle complex, distributed tasks spanning multiple environments (future capability)
- **Orchestration Layer**: Central coordination system managing agent teams, workload balancing, and inter-agent communication (roadmap item)
- **Resource Management**: Intelligent allocation and balancing of computational resources across distributed agent instances (planned)
- **Future Architectural Moat**: When implemented, this multi-agent capability would be built into the core architecture from the ground up, requiring deep architectural planning that cannot be retrofitted

#### Adaptive Learning Architecture (Planned)
The future system architecture would support **real-time adaptive learning** that creates product stickiness:

- **Behavior Pattern Recognition**: Architecture designed to capture and learn from user behavior patterns in real time (planned)
- **Workflow Optimization**: System automatically optimizing workflows based on what works best for each user (future capability)
- **Habit Memory**: Enhanced persistent memory system that learns and adapts to individual user habits and preferences (roadmap item)
- **Future Sticky Product Experience**: Unlike static automation, the planned adaptive intelligence would create increasing value over time

#### Enterprise Customization (Planned)
Future architecture would support **customizable agents for enterprise teams**:

- **Role-Based Agent Configurations**: Architecture allowing each employee to have a tailored assistant optimized for their specific role (planned)
- **Customizable Tool Interactions**: Agents interacting with tools differently based on user role, preferences, and organizational needs (future capability)
- **Team-Wide Deployment**: System designed to support deployment of customized agent configurations across entire organizations (roadmap item)
- **Scalable Personalization**: Maintaining individual productivity optimization while scaling to enterprise-level deployment (planned)

#### General Scalability Features (Planned)
- Multi-user support (planned)
- Distributed execution (planned)
- Cloud sync (optional, planned)
- Horizontal scaling (planned)

## Monitoring & Observability

### Logging
- Structured logging with context
- Log levels: DEBUG, INFO, WARNING, ERROR
- Performance timing logs

### Metrics (Planned)
- Request latency
- Tool execution time
- Memory usage
- Error rates

## Testing Architecture

### Test Structure
```
tests/
├── backend/
│   ├── test_agent_system.py
│   ├── test_tool_execution.py
│   └── test_llm_integration.py
└── frontend/
    ├── App.spec.jsx
    └── ChatInterface.spec.jsx
```

### Testing Strategy
- **Unit Tests**: Individual components
- **Integration Tests**: Component interactions
- **E2E Tests**: Full system workflows
- **Mocking**: External dependencies mocked

---

For more detailed information, see:
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
- [Frontend Architecture](FRONTEND_ARCHITECTURE.md)
- [Communication Flow](COMMUNICATION_FLOW.md)
