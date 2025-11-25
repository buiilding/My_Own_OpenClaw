# Desktop Assistant Backend Architecture

This document describes the high-level architecture of the Desktop Assistant backend.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Components](#core-components)
4. [Domain Structure](#domain-structure)
5. [Data Flow](#data-flow)
6. [Dependency Injection](#dependency-injection)
7. [Event System](#event-system)
8. [Extension Points](#extension-points)

---

## Overview

The Desktop Assistant backend is a production-grade, scalable system built with:
- **FastAPI** for the web API
- **Dependency Injection** for loose coupling
- **Event-driven architecture** for decoupling
- **Domain-driven design** for clear boundaries
- **Async/await** throughout for performance

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FastAPI Layer                        │
│  (WebSocket, HTTP endpoints, request handling)         │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                 Session Manager                         │
│  (Manages user sessions, lifecycle)                    │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Agent Session                          │
│  (Conversation state, history, context)                │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼────────┐      ┌─────────▼──────────┐
│  Agent Executor│      │  Tool Orchestrator│
│  (Main loop)   │      │  (Tool execution) │
└───────┬────────┘      └─────────┬──────────┘
        │                         │
        │                         │
┌───────▼────────┐      ┌─────────▼──────────┐
│   LLM Client   │      │   Tool Registry   │
│  (LiteLLM)     │      │  (Tool management)│
└────────────────┘      └───────────────────┘
```

---

## Core Components

### 1. Application Container

**Location**: `backend/src/core/container.py`

Central dependency injection container using `dependency-injector`. Manages all application services and their dependencies.

**Key Responsibilities**:
- Service instantiation and lifecycle
- Dependency resolution
- Configuration management

### 2. Agent Session

**Location**: `backend/src/agent/core.py`

Represents a single user session with:
- Conversation history
- Memory manager
- Tool registry access
- LLM client
- Configuration

### 3. Agent Executor

**Location**: `backend/src/agent/executor.py`

Main execution loop:
1. Prepare context (memories, history)
2. Build prompt
3. Get LLM response
4. Parse response
5. Execute tools if needed
6. Repeat until completion

### 4. Tool System

**Location**: `backend/src/tools/`

- **ToolRegistry**: Manages available tools
- **ToolLoader**: Loads tools from filesystem
- **ToolOrchestrator**: Executes tool calls
- **SDK Tools**: All tools inherit from `backend.src.sdk.tool.Tool`

### 5. Memory System

**Location**: `backend/src/memory/`

- **MemoryManager**: High-level memory operations
- **MemoryStore**: Low-level storage (SQLite + FAISS)
- **SemanticRetrieval**: Semantic search
- **MemorySummarizer**: Episodic → semantic conversion

### 6. LLM Integration

**Location**: `backend/src/llm/`

- **LLMClient**: LiteLLM wrapper
- **PromptConstructor**: Builds prompts with tools
- **ResponseParser**: Extracts tool calls from LLM output

---

## Domain Structure

The codebase is organized into domains:

```
backend/src/
├── agent/          # Agent domain (session, executor)
├── tools/          # Tools domain (registry, loader, tools)
├── memory/         # Memory domain (storage, retrieval, summarization)
├── llm/            # LLM domain (client, prompts, parsing)
├── api/            # API layer (routes, dependencies)
└── core/           # Core infrastructure
    ├── container.py      # DI container
    ├── config.py         # Configuration
    ├── bus.py            # Event bus
    ├── plugins.py        # Plugin registry
    ├── exceptions.py     # Exception hierarchy
    └── interfaces/       # Protocol interfaces
```

---

## Data Flow

### User Query Processing

```
User Query
    │
    ▼
Session Manager (get/create session)
    │
    ▼
Agent Session.process_query()
    │
    ▼
Agent Executor.process_query()
    │
    ├─► Memory Manager.retrieve_memories()
    │   └─► SemanticRetrieval.hybrid_search()
    │
    ├─► Prompt Constructor.build_prompt()
    │   ├─► System prompt
    │   ├─► Tool schemas
    │   └─► Conversation history
    │
    ├─► LLM Client.get_completion_stream()
    │   └─► LiteLLM API
    │
    ├─► Response Parser.parse_response()
    │   └─► Extract tool calls
    │
    └─► Tool Orchestrator.execute_tools()
        ├─► Tool Registry.get_tool()
        ├─► Tool.run()
        └─► Plugin Manager.on_tool_end()
```

### Memory Storage

```
Tool Execution / Interaction
    │
    ▼
Memory Manager.store_episodic_memory()
    │
    ▼
Memory Store.add()
    ├─► Generate embedding
    ├─► Store in SQLite
    └─► Add to FAISS index
```

---

## Dependency Injection

All major components are provided via DI container:

```python
# Container definition
class ApplicationContainer(containers.DeclarativeContainer):
    config_manager = providers.Singleton(ConfigManager)
    config = providers.Singleton(lambda cm: cm.get_config(), cm=config_manager)
    
    tool_loader = providers.Singleton(ToolLoader, config=config)
    tool_registry = providers.Singleton(ToolRegistry, config=config, tool_loader=tool_loader)
    
    # ... more providers
```

**Benefits**:
- Loose coupling
- Easy testing (mock dependencies)
- Single source of truth
- Lifecycle management

---

## Event System

Events decouple components:

```python
# Component A publishes event
await message_bus.publish(ToolExecuted(...))

# Component B subscribes
message_bus.subscribe(ToolExecuted, handle_tool_execution)
```

**Available Events**:
- `UserMessageReceived`
- `AgentResponseGenerated`
- `ToolExecutionStarted`
- `ToolExecuted`
- `MemoryStored`
- `SessionCreated`
- `ConfigChanged`
- `ErrorOccurred`

---

## Extension Points

### 1. Plugins

Intercept agent execution:
- `on_instruction()`: Before query processing
- `on_llm_response()`: After LLM response
- `on_tool_start()`: Before tool execution
- `on_tool_end()`: After tool execution

### 2. Tools

Extend agent capabilities:
- Inherit from `backend.src.sdk.tool.Tool`
- Define Pydantic args model
- Implement `run()` method

### 3. Event Handlers

React to system events:
- Subscribe to events via event bus
- Implement async handlers
- Use filters for selective handling

### 4. Memory Stores

Custom storage backends:
- Implement `MemoryStoreInterface`
- Async operations
- Support semantic search

---

## Key Design Principles

1. **Separation of Concerns**: Each component has a single responsibility
2. **Dependency Injection**: Loose coupling via DI
3. **Interface-Based Design**: Protocols define contracts
4. **Event-Driven**: Decoupled communication via events
5. **Async-First**: All I/O operations are async
6. **Type Safety**: Strict type hints throughout
7. **Error Handling**: Centralized exception hierarchy
8. **Extensibility**: Clear extension points for plugins and tools

---

## Technology Stack

- **FastAPI**: Web framework
- **LiteLLM**: LLM abstraction layer
- **Pydantic**: Data validation
- **SQLite + FAISS**: Memory storage
- **dependency-injector**: DI container
- **aiosqlite**: Async database
- **SentenceTransformers**: Embeddings

---

## Future Enhancements

- [ ] Caching layer for tool schemas and embeddings
- [ ] Input validation middleware
- [ ] Security boundaries for tool execution
- [ ] Resource limits and quotas
- [ ] Audit logging
- [ ] Metrics and monitoring

