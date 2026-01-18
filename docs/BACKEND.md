# Backend Responsibilities

## Overview

The backend is a **FastAPI** application that orchestrates the AI agent, manages conversation, coordinates tools, and integrates with LLM providers.

## Core Responsibilities

### 1. Agent Orchestration

**Location**: `backend/src/agent/`

- **AgentSession**: Manages conversation history, LLM interaction, tool orchestration
- **AgentExecutor**: Core execution loop, processes queries, integrates LLM, tools, and memory
- **Interaction Loop**: Handles streaming responses, tool calls, and result processing

### Key Components

- `core.py`: `AgentSession` - Main agent brain
- `executor.py`: `AgentExecutor` - Execution loop
- `interaction_loop.py`: `InteractionLoop` - Streaming response handling

### Responsibilities

- Maintains conversation history
- Processes user queries with LLM
- Determines tool calls needed
- Coordinates tool execution (delegates to frontend)
- Processes tool results
- Streams responses back to frontend

### 2. LLM Integration

**Location**: `backend/src/llm/`

- **Multi-Provider Support**: OpenAI, Anthropic, Gemini, Mistral, OpenRouter, Ollama, LM Studio
- **Streaming**: Real-time response streaming
- **Prompt Construction**: Builds system prompts with tool schemas and context

### Key Components

- `llm_client.py`: Main LLM client interface
- `providers/`: Provider-specific implementations
- `prompt_constructor.py`: Builds prompts with tool schemas

### Features

- Automatic provider selection based on config
- Streaming responses
- Tool schema injection
- System context integration

### 3. Tool System

**Location**: `backend/src/tools/`

- **Tool Registry**: Manages tool schemas and definitions
- **Remote Tools**: Stubs that delegate execution to frontend
- **Schema Registry**: Generates JSON schemas for LLM

### Key Components

- `registry.py`: `ToolRegistry` - Tool registration and schema management
- `remote.py`: Remote tool stubs (delegates to frontend)
- `orchestrator.py`: Tool execution orchestration

### Tool Types

- **Remote Tools**: Stubs that send execution requests to frontend
  - Computer control (mouse, keyboard, screenshot, scroll)
  - Filesystem (read_file, write_file, list_directory)
  - System (get_open_windows, get_system_stats, wait)

### Tool Execution Flow

**Individual Tools**:
1. LLM determines tool call needed
2. Backend creates tool execution request
3. Request sent to frontend via WebSocket
4. Frontend executes tool locally (Node.js main process)
5. Frontend pre-formats result with system context XML embedded in `llm_content`
6. Pre-formatted result + screenshot returned to backend
7. Backend uses pre-formatted message directly (no additional formatting)
8. Backend processes result and continues conversation

**Bundled Tools** (Multiple tools chained together):
1. LLM determines multiple tool calls needed (chained for predictable actions)
2. Backend sends `bundle_start` event, then individual `tool_call` events, then `bundle_end` event
3. Frontend collects tools into bundle and executes sequentially
4. Frontend captures system state and screenshot **once at bundle end**
5. Frontend formats **combined message** with all tool outputs in single `llm_content`
6. Frontend displays **single combined output** in UI (not individual outputs)
7. Frontend sends bundled result with `bundled: true`, `tools` array, and `combined_llm_content`
8. Backend stores individual tool results for orchestrator matching
9. Backend creates combined result and stores in `_bundled_results` for history
10. Backend processes results: uses combined result for history (single message), not individual results
11. Backend continues conversation

**Note**: Backend requires pre-formatted messages with `is_preformatted: true` flag. The `format_for_history()` method will raise `ValueError` if content is not pre-formatted.

**Bundled Result Storage**: Bundled tools are stored as a **single message** in conversation history (not multiple messages), with one `system_context` and one screenshot shared across all tools in the bundle.

### 4. Memory System

**Location**: `backend/src/memory/` (embedding provider), frontend stores memories locally

- **Episodic Memory**: Conversation history, tool executions (stored in frontend)
- **Semantic Memory**: Vector embeddings for semantic search (stored in frontend)
- **Backend Role**: Receives memories in query messages, uses them for context

### Responsibilities

- Receives memories from frontend in query messages (frontend queries its own memory store)
- Integrates memories into conversation context
- Provides embedding generation via `backend/src/memory/embeddings.py` (if needed)

**Note**: Memory storage and retrieval happens entirely on the frontend. The backend receives pre-queried memories in query messages and uses them for LLM context. The backend does not actively query or coordinate memory storage.

### 5. Vision Service

**Location**: `backend/src/services/vision/`

- **InternVL Model**: UI grounding, predicts click coordinates from natural language
- **Singleton**: Pre-initialized at startup
- **Device Management**: CUDA/CPU support

### Usage

- Used by `mouse_control` tool with `find_coordinates_by="prediction"` for vision-based element detection
- Pre-initialized for fast inference

### 6. OCR Plugin

**Location**: `backend/src/agent/plugins/ocr_plugin.py`

- **RapidOCR**: Text detection from screenshots
- **Proactive OCR**: Automatically triggered on screenshots from frontend
- **Tool Integration**: Used by `mouse_control` tool with `find_coordinates_by="ocr"` for OCR-based coordinate resolution

### Features

- Pre-initialized at startup (singleton)
- CUDA support for fast processing
- Proactive analysis of screenshots

### 7. WebSocket API

**Location**: `backend/src/api/routes/websocket.py`

- **Real-time Communication**: Bidirectional WebSocket connection
- **Message Handling**: Query messages, tool results, streaming responses
- **Session Management**: User session tracking

### Message Types

- **Query**: User query with system state and memories
- **Tool Result**: Tool execution results from frontend
- **Streaming Events**: Thinking, tool calls, text chunks, errors

### 8. Configuration Management

**Location**: `backend/src/core/config/`

- **ConfigManager**: Loads and manages application configuration
- **ConfigurationService**: Centralized config with change notifications
- **Multi-Provider Config**: LLM provider configurations

### 9. Dependency Injection

**Location**: `backend/src/core/container/`

- **Container**: Dependency injection container
- **Specialized Containers**: Core, Tool, Memory containers
- **Lazy Initialization**: Expensive resources initialized on demand

## Key Design Principles

1. **No Local Tool Execution**: Backend never executes computer control or filesystem tools locally
2. **Tool Delegation**: All tool execution delegated to frontend
3. **Schema Management**: Backend provides tool schemas to LLM, frontend executes
4. **Streaming**: Real-time response streaming via WebSocket
5. **Plugin System**: Extensible plugin architecture (OCR, etc.)

## Communication Flow

```
Backend receives query
    ↓
Process with LLM
    ↓
Determine tool calls
    ↓
Send tool execution request → Frontend
    ↓
Receive tool result + screenshot ← Frontend
    ↓
Process result
    ↓
Continue conversation or stream response
```

## File Structure

```
backend/
├── src/
│   ├── agent/              # Agent domain
│   │   ├── core/           # Core agent state & execution
│   │   │   ├── core.py     # AgentSession
│   │   │   ├── executor.py # AgentExecutor
│   │   │   ├── interaction_loop.py
│   │   │   ├── session_manager.py
│   │   │   └── state.py     # ConversationHistory
│   │   ├── llm/            # LLM interaction & events
│   │   │   ├── event_presenter.py
│   │   │   ├── llm_interaction_handler.py
│   │   │   └── prompt_coordinator.py
│   │   ├── tools/          # Tool orchestration
│   │   │   ├── tool_executor.py
│   │   │   ├── tool_preparer.py
│   │   │   ├── ocr_coordinator.py
│   │   │   ├── screenshot_manager.py
│   │   │   ├── result_transformer.py
│   │   │   ├── synthetic_result_factory.py
│   │   │   ├── vision_service_provider.py
│   │   │   └── resolvers/   # Coordinate resolvers
│   │   ├── history/        # Agent memory
│   │   │   └── history_committer.py
│   │   └── plugins/        # Plugins
│   │       ├── interface.py
│   │       ├── manager.py
│   │       └── ocr_plugin.py
│   ├── llm/                # LLM integration
│   │   ├── llm_client.py
│   │   ├── providers/
│   │   ├── prompt_constructor.py
│   │   └── parser.py
│   ├── tools/              # Tool system
│   │   ├── registry.py
│   │   ├── remote.py
│   │   ├── orchestrator.py
│   │   ├── computer/       # Computer control schemas
│   │   ├── filesystem/     # Filesystem schemas
│   │   └── system/         # System schemas
│   ├── api/                # API routes
│   │   ├── routes/
│   │   │   └── websocket.py
│   │   └── handlers/
│   ├── services/           # Services
│   │   └── vision/         # InternVL
│   ├── core/               # Core utilities
│   │   ├── config/
│   │   ├── container/
│   │   └── cache.py
│   └── memory/             # Memory system
```

## Important Notes

1. **No File Operations**: Backend does NOT read/write files locally - all file operations happen on frontend
2. **No Computer Control**: Backend does NOT control mouse/keyboard - all computer control happens on frontend
3. **Screenshots**: Backend receives screenshots from frontend, never captures them
4. **System State**: Backend receives system state from frontend, never queries OS directly
