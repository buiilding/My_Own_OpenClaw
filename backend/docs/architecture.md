# Backend Architecture

## Overview

The backend is a **FastAPI** application that orchestrates the AI agent, manages conversation, coordinates tools, and integrates with LLM providers. It follows a **delegation pattern** where it defines tool schemas and orchestrates execution, but **never executes tools locally**.

## Core Principles

1. **No Local Tool Execution**: Backend never executes computer control or filesystem tools locally
2. **Tool Delegation**: All tool execution delegated to frontend
3. **Schema Management**: Backend provides tool schemas to LLM, frontend executes
4. **Streaming**: Real-time response streaming via WebSocket
5. **Stateless Sessions**: Agent sessions managed in-memory per WebSocket connection

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                  API Layer (FastAPI)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  WebSocket   │  │  Embeddings  │  │  Settings    │  │
│  │  Routes      │  │  Routes      │  │  Routes      │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
└─────────┼────────────────────────────────────────────────┘
          │
┌─────────┼────────────────────────────────────────────────┐
│         │         Agent Layer                            │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  AgentSession│  │  Executor    │  │ Interaction  │  │
│  │              │  │              │  │ Loop         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼──────────────────┼──────────────────┼──────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────┐
│         │                  │                  │  Services │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐  │
│  │  LLM Client  │  │  Tool System  │  │  Memory      │  │
│  │              │  │              │  │  System      │  │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘  │
└────────────────────────────┼──────────────────┼──────────┘
                             │                  │
┌────────────────────────────┼──────────────────┼──────────┐
│                             │                  │  Plugins │
│  ┌──────────────────────────▼───────┐  ┌──────▼───────┐ │
│  │  Vision Service (InternVL)       │  │  OCR Plugin   │ │
│  └──────────────────────────────────┘  └───────────────┘ │
└───────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### API Layer

**Location**: `backend/src/api/`

- **WebSocket Routes**: Real-time bidirectional communication
- **Embeddings Routes**: Embedding generation endpoint
- **Settings Routes**: Configuration management endpoints

### Agent Layer

**Location**: `backend/src/agent/`

- **AgentSession**: Manages conversation history, LLM client, tool registry
- **Executor**: Core execution loop, processes queries, coordinates tools
- **InteractionLoop**: Handles streaming responses, tool calls, result processing

### Service Layer

**Location**: `backend/src/llm/`, `backend/src/tools/`, `backend/src/memory/`

- **LLM Client**: Multi-provider LLM integration with streaming
- **Tool System**: Tool schema management, remote tool stubs
- **Memory System**: Memory coordination (queries frontend for memories)

### Plugin Layer

**Location**: `backend/src/services/vision/`, `backend/src/agent/plugins/`

- **Vision Service**: InternVL model for UI grounding
- **OCR Plugin**: RapidOCR for text detection from screenshots

### Service Layer

**Location**: `backend/src/core/services/`

- **TTS Service**: Piper TTS for text-to-speech synthesis (CUDA/CPU support)
- **GPU Memory Manager**: Coordinates GPU memory usage across services to prevent OOM errors

## Key Design Patterns

### 1. Dependency Injection

**Location**: `backend/src/core/container/`

- Uses `dependency-injector` library
- Specialized containers: Core, Tool, Memory
- Lazy initialization of expensive resources

### 2. Protocol-Based Interfaces

**Location**: `backend/src/core/interfaces/`

- Protocol-based interfaces for loose coupling
- Type safety with Protocol classes
- Easy testing with mocks

### 3. Event-Driven Architecture

**Location**: `backend/src/core/bus.py`, `backend/src/core/events.py`

- Event bus for component communication
- Streaming events for real-time updates
- Decoupled component interaction

### 4. Tool Delegation Pattern

**Location**: `backend/src/tools/remote.py`

- Backend defines tool schemas
- Frontend executes tools
- Remote tool stubs delegate execution

## Data Flow

### Query Processing Flow

```
1. WebSocket receives query
   ↓
2. QueryHandler validates and creates/gets AgentSession
   ↓
3. Executor processes query:
   - Gets system state and memories from frontend
   - Builds prompt with tool schemas
   - Sends to LLM
   ↓
4. LLM responds with tool calls
   ↓
5. Tool execution requests sent to frontend
   ↓
6. Frontend executes tools and returns results
   ↓
7. Executor processes results:
   - Updates conversation history
   - Continues LLM processing
   - Streams response chunks
   ↓
8. ResponseFormatter formats and sends events
   ↓
9. WebSocket streams events to frontend
```

### Tool Execution Flow

```
1. LLM determines tool call needed
   ↓
2. Backend creates RemoteToolResult
   ↓
3. Tool execution request sent to frontend via WebSocket
   ↓
4. Frontend executes tool locally (sidecar)
   ↓
5. Frontend captures screenshot automatically
   ↓
6. Tool result + screenshot returned to backend
   ↓
7. Backend processes result:
   - Stores screenshot in session
   - Triggers proactive OCR (async)
   - Updates conversation history
   ↓
8. Backend continues LLM processing
```

## Important Constraints

### What Backend Does NOT Do

1. **No File Operations**: Backend never reads/writes files locally
2. **No Computer Control**: Backend never controls mouse/keyboard
3. **No Screenshot Capture**: Backend receives screenshots, never captures them
4. **No System State Query**: Backend receives system state, never queries OS directly
5. **No Local Tool Execution**: All tools execute on frontend

### What Backend Does

1. **Orchestrates**: Manages conversation, coordinates tools
2. **Provides Schemas**: Generates tool schemas for LLM
3. **Processes Results**: Handles tool results, updates conversation
4. **Streams Responses**: Real-time response streaming
5. **Manages Memory**: Coordinates memory queries (frontend stores)

## File Structure

```
backend/
├── src/
│   ├── api/                 # API routes and handlers
│   │   ├── routes/
│   │   │   ├── websocket.py
│   │   │   └── embeddings.py
│   │   └── handlers/
│   │       ├── query_handler.py
│   │       ├── tool_result_handler.py
│   │       └── response_formatter.py
│   ├── agent/               # Agent core
│   │   ├── core.py          # AgentSession
│   │   ├── executor.py      # Executor
│   │   ├── interaction_loop.py
│   │   └── plugins/         # Plugins (OCR)
│   ├── llm/                 # LLM integration
│   │   ├── llm_client.py
│   │   ├── providers/       # Provider implementations
│   │   └── prompt_constructor.py
│   ├── tools/               # Tool system
│   │   ├── registry.py      # ToolRegistry
│   │   ├── remote.py        # Remote tool stubs
│   │   └── orchestrator.py
│   ├── services/            # Services
│   │   └── vision/          # InternVL
│   ├── memory/              # Memory coordination
│   ├── core/                # Core utilities
│   │   ├── config/          # Configuration
│   │   ├── container/       # Dependency injection
│   │   └── cache.py         # Caching
│   └── main.py              # Application entry point
```

## Configuration

**Location**: `backend/src/core/config/`

- **ConfigManager**: Loads and manages configuration
- **AppConfig**: Pydantic model for type-safe configuration
- **Multi-Provider**: LLM provider configurations

## Caching

**Location**: `backend/src/core/cache.py`

- **Tool Schemas**: Cached with 1-hour TTL
- **Embeddings**: Cached with 24-hour TTL
- **LLM Clients**: Cached with 24-hour TTL

## Security

**Location**: `backend/src/core/security/`

- **Permission System**: Tool permission declarations
- **Security Framework**: Tool execution security (not used for remote tools)

## Performance Considerations

1. **Lazy Initialization**: Expensive resources initialized on demand
2. **Caching**: Tool schemas, embeddings, LLM clients cached
3. **Streaming**: Real-time response streaming for better UX
4. **Async/Await**: Fully async architecture for concurrency
