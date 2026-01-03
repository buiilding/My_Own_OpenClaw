# Backend Responsibilities

## Overview

The backend is a **FastAPI** application that orchestrates the AI agent, manages conversation, coordinates tools, and integrates with LLM providers.

## Core Responsibilities

### 1. Agent Orchestration

**Location**: `backend/src/agent/`

- **AgentSession**: Manages conversation history, LLM interaction, tool orchestration
- **Executor**: Core execution loop, processes queries, integrates LLM, tools, and memory
- **Interaction Loop**: Handles streaming responses, tool calls, and result processing

### Key Components

- `core.py`: `AgentSession` - Main agent brain
- `executor.py`: `Executor` - Execution loop
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

1. LLM determines tool call needed
2. Backend creates tool execution request
3. Request sent to frontend via WebSocket
4. Frontend executes tool locally (sidecar)
5. Result + screenshot returned to backend
6. Backend processes result and continues conversation

### 4. Memory System

**Location**: `backend/src/core/services/` (coordination), `backend/src/memory/` (implementation)

- **Episodic Memory**: Conversation history, tool executions
- **Semantic Memory**: Vector embeddings for semantic search
- **Coordination**: Backend coordinates, frontend stores locally

### Responsibilities

- Queries frontend for relevant memories
- Integrates memories into conversation context
- Coordinates with frontend memory storage

### 5. Vision Service

**Location**: `backend/src/services/vision/`

- **InternVL Model**: UI grounding, predicts click coordinates from natural language
- **Singleton**: Pre-initialized at startup
- **Device Management**: CUDA/CPU support

### Usage

- Used by `predict_click` tool for vision-based element detection
- Pre-initialized for fast inference

### 6. OCR Plugin

**Location**: `backend/src/agent/plugins/ocr_plugin.py`

- **RapidOCR**: Text detection from screenshots
- **Proactive OCR**: Automatically triggered on screenshots from frontend
- **Tool Integration**: Used by `click_ocr_element` tool

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
│   ├── agent/              # Agent core
│   │   ├── core.py
│   │   ├── executor.py
│   │   └── interaction_loop.py
│   ├── llm/                # LLM integration
│   │   ├── llm_client.py
│   │   ├── providers/
│   │   └── prompt_constructor.py
│   ├── tools/              # Tool system
│   │   ├── registry.py
│   │   ├── remote.py
│   │   └── orchestrator.py
│   ├── api/                # API routes
│   │   ├── routes/
│   │   │   └── websocket.py
│   │   └── handlers/
│   ├── services/           # Services
│   │   └── vision/         # InternVL
│   ├── agent/plugins/      # Plugins
│   │   └── ocr_plugin.py
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
