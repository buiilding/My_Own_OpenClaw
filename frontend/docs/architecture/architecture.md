---
summary: "System Architecture"
read_when:
  - When making cross-cutting system changes.
---

# System Architecture

For architecture navigation by ownership, state, and failure domain, start with [Architecture Hub](README.md).

## Overview

WindieOS is built as a distributed system with clear separation between the renderer UI, Electron main agent host, SDK local runtime backed by the local-runtime Python implementation, and backend control plane (Python/FastAPI). The architecture follows clean architecture principles with dependency injection, protocol-based interfaces, and service-based extensions (vision/OCR).

The intended product boundary is:

- **Hosted backend control plane** for OCR, vision/prediction, agent orchestration, artifacts, and session state.
- **SDK local-runtime execution plane** for actions that must touch the user's machine: screenshots, mouse, keyboard, browser/runtime control, local files, and local processes.
- **Open-source client surface** made up of the UI, SDK local runtime, local-runtime Python implementation, and SDK. The SDK should call the hosted backend when it needs backend-owned capabilities; it should not require users to run a backend locally just to use OCR, prediction, or hosted agent APIs.

Current runtime topology includes both:

- a primary chat stream plane (`/ws`) for query/tool-turn orchestration, and

See:


## Future: Hosted Multi-Tenant Architecture (Planned)

To bring this to end users at scale, the system will evolve into a hosted, multi-tenant platform with subscription-based usage and limits while preserving a local-only mode.

### Target Cloud Topology

```
User Desktop App
    │
    │  HTTPS / WebSocket (auth token)
    ▼
API Gateway / Edge
    │  ├─ Auth + Session Service
    │  ├─ Rate Limiter + Usage Metering
    │  └─ Billing + Entitlements
    ▼
Agent Execution Layer
    │  ├─ Session Router
    │  ├─ Agent Workers
    │  └─ Tool Dispatch Queue
    ▼
Data Plane
    ├─ Postgres (users, plans, usage, metadata)
    ├─ Redis (sessions, rate limits, queues)
    ├─ Vector Store (per-tenant memory)
    └─ Object Storage (screenshots, logs, audit)
```

### Core Principles for Multi-Tenancy
- **Per-tenant isolation** at the API, DB, cache, and memory layers.
- **Plan-based entitlements** governing model access, concurrency, and tools.
- **Usage metering** across tokens, tool calls, screenshots, and compute time.
- **Graceful limit UX**: soft warnings + hard blocking with upgrade flow.

### Local-Only / Self-Hosted Mode
Local-only or custom hosted deploymented mode remains available for privacy-first users or internal deployments:
- No cloud sync
- Local memory + local storage
- Local model execution when configured
- Optional custom hosted deployment when explicitly provisioned

This is not the primary open-source SDK contract. The default client contract is hosted backend plus SDK local runtime.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Electron Agent Host + SDK Runtime              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Renderer Process (React)                          │  │
│  │  - ChatInterface                                     │  │
│  │  - Dashboard                                        │  │
│  │  - MessageList                                       │  │
│  │  - Context Providers (AppConfigContext, AppStatusContext, ChatProvider)      │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕ IPC                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Main Process (Node.js)                              │  │
│  │  - IPC Bridge (ipc.cjs)                              │  │
│  │  - Electron agent host                               │  │
│  │  - Wakeword Bridge                                    │  │
│  │  - Local Runtime Daemon (sidecar_daemon.py)            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕ WebSocket / HTTP
┌─────────────────────────────────────────────────────────────┐
│            Hosted Backend Control Plane (FastAPI)           │
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
│ ┌──────────┐ ┌────────┐ ┌──────┐ ┌──────────┐ ┌────────┐ │
│ │Embeddings│ │Tools   │ │ LLM  │ │ OCR      │ │ Vision  │ │
│ │ API      │ │System  │ │Client│ │ Service  │ │Service  │ │
│ └──────────┘ └────────┘ └──────┘ └──────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Architecture

#### Renderer Process (React)
- **Components**: React components organized by feature (chat, settings, voice)
- **Context**: Split contexts for performance (AppConfigContext, AppStatusContext, ChatProvider)
- **State Management**: Zustand store for chat state, Context API for app config
- **Hooks**: Feature-specific hooks (useChatStream, useChatMessageSender)
- **Infrastructure**: SDK runtime facades, projection builders, artifact helpers, IpcBridge
- **Runtime Clients**: Renderer app-runtime clients and SDK command facades for
  renderer-to-main requests, SDK projections, and artifact URL helpers

#### Main Process (Node.js)
- **IPC Bridge**: Secure communication between renderer and main
- **Electron Agent Host**: Starts and adapts the SDK runtime that owns hosted
  backend websocket transport, conversation projection, and local-runtime
  coordination
- **Wakeword Bridge**: Python subprocess management for wakeword detection
- **Local Runtime Daemon**: SDK-owned local-runtime daemon for tool execution,
  system state capture, and local memory

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
- **Memory HTTP Services**: `/api/embeddings`, `/api/semantic/summarize`, and `/api/semantic/title` support local-runtime memory retrieval, semantic summarization, and conversation-title generation
- **Tool System**: Tool registry and orchestration
- **LLM Client**: Multi-provider LLM abstraction
  - OpenAI provider includes a model-gated native reasoning runtime (`litellm.aresponses`) alongside the provider-generic path
- **Vision Service**: AI-powered visual understanding
- **OCR Service**: RapidOCR-backed text detection for coordinate resolution

## Data Flow

### User Query Flow

```
1. User types message in UI
   ↓
2. useChatMessageSender hook handles message
   ↓
3. Renderer capture policy requests a screenshot when
   `include_query_screenshot=true` (default enabled)
   ↓
4. Message sent via IpcBridge → Main Process
   ↓
5. Electron main resolves host context and invokes the Agent SDK runtime
   ↓
6. Agent SDK runtime -> WebSocket -> Backend
   ↓
7. Backend validates message (private backend implementation)
   ↓
8. Message routed to QueryHandler
   ↓
9. AgentSession.process_query()
   ↓
10. PromptConstructor formats message
    ↓
11. LLM generates response with tool calls
    ↓
12. ToolPreparer prepares tool calls
    ↓
13. Backend emits tool-call/tool-bundle events on the SDK transport
    ↓
14. SDK runtime receives and normalizes tool-call/tool-bundle events
    ↓
15. ToolExecutionCoordinator routes execution through the SDK local-runtime client
    ↓
16. Local-runtime Python implementation executes local tools and captures local state when required
    ↓
17. SDK runtime sends tool-result/tool-bundle-result back to backend
    ↓
18. ToolResultHandler processes results (centralized storage)
    ↓
19. Agent continues or completes
    ↓
20. SDK runtime projects the streamed response for renderer consumers
    ↓
21. useChatStream hook processes events
    ↓
22. Chat store updated, UI updates in real-time
```

### Hybrid SDK Flow

The SDK is expected to route work across both runtime planes instead of treating everything as a local tool call:

1. SDK captures a screenshot through the local runtime when fresh local state is needed.
2. SDK uploads the image to the hosted backend artifact API or sends inline base64.
3. SDK calls hosted perception APIs such as `/api/sdk/ocr/*` or `/api/sdk/vision/*`.
4. Hosted backend returns deterministic grounding data such as OCR rows, candidate IDs, bounding boxes, and click centers.
5. SDK sends the resulting local action, such as click or type, back through the local runtime.

Example: `desktop.clickText("Search Amazon")` is a hybrid operation, not a pure local action. The local runtime captures the screen and performs the click, while the hosted backend resolves the OCR text target.

### Screenshot Capture Strategy

Screenshots are captured strategically at key points to provide visual context for AI decision-making. The system captures screenshots in the following scenarios:

#### User Message Screenshots
- **Timing**: Captured for user messages when `include_query_screenshot` is enabled (default `true`)
- **Purpose**: Provides initial visual context showing the current screen state before any AI action
- **Location**: `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- **Storage**: Included in user query payload sent to backend

#### Tool Result Screenshots
- **Timing**: Automatically captured after computer-use tool execution (mouse_control, keyboard_control, scroll_control, etc.)
  - **Individual Tools**: Screenshot captured **once** after tool execution completes
  - **Atomic Bundles**: Screenshot captured **once** after all bundled tools execute (single tool-bundle message, single tool-bundle-result response)
- **Purpose**: Shows the result state after tool execution for verification and continued context
- **Location**: Local-runtime tool implementation, routed through the SDK `ToolExecutionCoordinator` and backed by local-runtime Python
- **Implementation**:
  - Individual tool path uses `ensureAutoCapture(...)` (shared capture policy helper) and captures once when no screenshot is already in tool output.
  - Bundle path captures once after the full bundle run when computer-use actions are present.
  - Default wait is 2 seconds for most computer-use tools, 0 for `screenshot`, and may be overridden by tool args (`wait`/`seconds`).
- **Storage**: Attached to tool result data sent back to backend

#### LLM-Requested Screenshots
- **Timing**: When the LLM explicitly calls the `screenshot` tool
- **Purpose**: AI-driven capture when the model determines it needs current visual information
- **Location**: Standard tool execution flow
- **Storage**: Returned as tool result data

**Important**: Screenshots are NOT captured continuously or on a timer - they are only taken when explicitly requested by the system or when providing context for user/AI interactions. This balances the need for visual context with performance considerations.

### Tool Execution Flow

```
1. LLM generates tool call
   ↓
2. ToolPreparer checks if screenshot needed
   ↓
3. ScreenshotManager ensures active screenshot is available
   ↓
4. OCRCoordinator runs OCR (if needed)
   ↓
5. CoordinateResolver resolves coordinates
   ↓
6. Tool call prepared with coordinates (shallow copy optimization)
   ↓
7. Tool-call event sent to the SDK runtime via WebSocket
   ↓
8. SDK runtime receives and normalizes the tool-call event
   ↓
9. ToolExecutionCoordinator routes execution to the SDK local-runtime client
   ↓
10. Tool dispatched through the SDK local-runtime bridge backed by local-runtime Python modules
    ↓
11. Local-runtime Python implementation executes tool
    ↓
12. Local-runtime Python implementation captures screenshot (if computer-use tool)
    ↓
13. Local-runtime Python implementation captures system state
    ↓
14. SDK/main result envelope normalizes output
    ↓
15. Result sent back to backend via WebSocket
    ↓
16. ToolResultHandler processes result (centralized storage)
    ↓
17. Result added to conversation history (O(1) access)
    ↓
18. Agent continues with next step
```

## Communication Protocols

### WebSocket Protocol

**Message Format**:
```json
{
  "id": "uuid-v4",
  "type": "query|list-models|tool-result|wakeword-detected|...",
  "payload": { ... },
  "timestamp": "ISO-8601"
}
```

**Message Types**:
- `query`: User query with optional screenshot
- `rehydrate-conversation`: Restore transcript history for a prior conversation_ref
- `list-models`: Request available models
- `load-settings`: Load client settings snapshot from backend session/default config
- `update-settings`: Update session config (applies on next query)
- `tool-result`: SDK/local-runtime tool execution result
- `tool-bundle-result`: Atomic bundle execution result
- `wakeword-detected`: Wakeword activation event

**Note**: both `load-settings` and `update-settings` are handled by the backend. Renderer settings remain the source of truth for these client settings fields.

**Response Types**:
- `streaming-response`: Streaming text chunks
- `streaming-complete`: End of stream
- `tool-call`: Tool execution request
- `tool-bundle`: Atomic tool bundle request
- `tool-output`: Tool execution result
- `llm-thought`: Thinking tokens (Gemini)
- `audio-chunk`: TTS audio chunk
- `wakeword-activated`: Wakeword activation status
- `wakeword-greeting`: Wakeword greeting text
- `settings-loaded`: Response to `load-settings`
- `settings-updated`: Response to `update-settings`
- `models-listed`: Response to `list-models`
- `system-prompt`: Model-facing prompt transparency event
- `tool-schemas`: Active tool schema transparency event
- `token-count`: Token usage metrics
- `user-message-full`: Full user message transparency event
- `assistant-message-full`: Full assistant message transparency event
- `error`: Error response

### IPC Protocol (Electron)

**Channels**:
- `windie:invoke`: Renderer -> Electron main SDK command bridge
- `windie:rows`, `windie:current-turn`, `windie:status`: SDK projection
  fan-out from Electron main to renderer surfaces
- `windie:conversation-event`: SDK-normalized conversation side-effect events
- `backend-settings-event`, `agent-capability-event`, `audio-chunk`: typed
  backend side-channel event fan-out for non-chat consumers
- `ipc-status`: Connection status
- `wakeword-audio-chunk`: Audio data for wakeword
- `wakeword-detected`: Wakeword detection event

## Dependency Injection

The backend uses `dependency-injector` with a composed container:

```python
ApplicationContainer
├── CoreContainer (config, LLM, TTS, vision, OCR, model, event bus)
├── ToolContainer (tool registry, orchestrator, agent factory)
├── MemoryContainer (embedding provider)
└── (ApiContainer created lazily in container facade)
```

## Service Layer

Core runtime services live under private backend implementation:

- `vision/` for UI grounding models
- `ocr/` for RapidOCR-backed text detection
- `token_service.py` for token counting

## Security Architecture

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
- **Vision Models**: Vision inference can run on GPU

## Error Handling

### Error Hierarchy
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

### Error Flow
1. Error occurs in component
2. Caught and wrapped in domain exception
3. Logged with context
4. Sanitized message sent to SDK/renderer consumers
5. User-friendly error displayed

## Extension Points

### Tool Development
- Inherit from `Tool` base class
- Implement `execute()` method
- Register in tool registry

### Vision Provider
- Implement a provider under private backend implementation
- Select in `services/vision/vision_service.py`

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
>
> Detailed sequencing and delivery plan: `../planning/future_plan.md` and Deployment Guide (private backend docs).

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
│   ├── test_llm_client.py
│   ├── test_interaction_loop.py
│   └── test_tool_result_orchestrator.py
├── sidecar/
│   ├── test_local_backend.py
│   └── tools/
│       └── test_browser_tool.py
└── frontend/
    ├── ChatStore.test.ts
    └── MessageInput.test.jsx
```

### Testing Strategy
- **Unit Tests**: Individual components
- **Integration Tests**: Component interactions
- **E2E Tests**: Full system workflows
- **Mocking**: External dependencies mocked

---

For more detailed information, see:
- Backend Architecture (private backend docs)
- [Frontend Architecture](frontend_architecture.md)
- [Communication Flow](communication_flow.md)
