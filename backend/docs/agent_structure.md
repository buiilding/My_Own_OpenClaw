# Agent Directory Structure

## Overview

The `backend/src/agent/` directory contains the core agent logic, organized into logical subpackages following the **Single Responsibility Principle (SRP)**. This structure improves maintainability, testability, and discoverability.

## Directory Structure

```
backend/src/agent/
├── __init__.py                    # Top-level exports
│
├── core/                          # Core agent state & execution
│   ├── __init__.py
│   ├── core.py                    # AgentSession - main agent brain
│   ├── executor.py                 # AgentExecutor - top-level orchestrator
│   ├── interaction_loop.py        # InteractionLoop - state machine controller
│   ├── state.py                   # ConversationHistory - message management
│   └── session_manager.py         # SessionManager - session lifecycle
│
├── llm/                           # LLM interaction, prompts, events
│   ├── __init__.py
│   ├── prompt_coordinator.py      # PromptCoordinator - prompt building & caching
│   ├── llm_interaction_handler.py # LLMInteractionHandler - streaming & tokens
│   └── event_presenter.py         # EventPresenter - UI event formatting
│
├── tools/                         # Tool orchestration & preparation
│   ├── __init__.py
│   ├── tool_executor.py          # ToolExecutor - tool orchestration
│   ├── tool_preparer.py          # ToolPreparer - tool preparation
│   ├── result_transformer.py     # ResultTransformer - pure data transformation
│   ├── screenshot_manager.py    # ScreenshotManager - screenshot acquisition
│   ├── ocr_coordinator.py        # OcrCoordinator - OCR synchronization
│   ├── vision_service_provider.py # VisionServiceProvider - service access
│   ├── synthetic_result_factory.py # SyntheticResultFactory - error results
│   │
│   └── resolvers/                 # Coordinate resolution subpackage
│       ├── __init__.py
│       └── coordinate_resolvers.py # OcrResolver, VisionResolver, CoordinateResolver
│
├── history/                       # Agent memory & state mutation
│   ├── __init__.py
│   └── history_committer.py      # HistoryCommitter - state mutation only
│
└── plugins/                       # Plugin system
    ├── __init__.py
    ├── interface.py              # AgentPlugin interface
    ├── manager.py                # PluginManager
    └── ocr_plugin.py             # OCR plugin implementation
```

## Package Responsibilities

### Core Package (`core/`)

**Purpose**: Core agent state and execution control.

**Components**:
- **`AgentSession`**: Main agent brain, manages conversation history, LLM client, tool registry, and orchestrates the agent loop
- **`AgentExecutor`**: Top-level orchestrator that composes specialized components and delegates to `InteractionLoop`
- **`InteractionLoop`**: Pure state machine controller that sequences execution states (prompt → LLM → parse → tools → repeat)
- **`ConversationHistory`**: Manages conversation messages with O(1) LLM history cache for performance
- **`SessionManager`**: Manages session lifecycle, config merging (global + user-specific), thread-safe session creation

**Key Features**:
- Session lifecycle management with per-user locks
- Recursive config merging for nested dictionaries
- Cross-platform TTS model path resolution
- Config subscription pattern for reactive updates

### LLM Package (`llm/`)

**Purpose**: LLM interaction, prompt management, and event presentation.

**Components**:
- **`PromptCoordinator`**: Handles prompt building and caching, optimizes prompt generation by caching metadata
- **`LLMInteractionHandler`**: Manages LLM streaming, text aggregation, and token counting, yields streaming events directly
- **`EventPresenter`**: Formats and emits all frontend/UI events, separates presentation from business logic

**Key Features**:
- O(1) prompt generation after first iteration (cached history)
- Real-time streaming event emission
- Token counting and usage tracking

### Tools Package (`tools/`)

**Purpose**: Tool orchestration, preparation, and result processing.

**Components**:
- **`ToolExecutor`**: Coordinates tool execution, delegates to `ToolPreparer`, `ResultTransformer`, and `HistoryCommitter`
- **`ToolPreparer`**: Orchestrates tool call preparation, coordinates screenshot acquisition, OCR/Vision resolution, and tool rewriting
- **`ResultTransformer`**: Pure data transformation (side-effect free), processes tool results with plugin hooks
- **`ScreenshotManager`**: Manages screenshot acquisition and hidden screenshot workflow with timeout handling
- **`OcrCoordinator`**: Coordinates OCR result acquisition, waits for proactive OCR completion
- **`VisionServiceProvider`**: Provides vision service access, decouples from session hierarchy
- **`SyntheticResultFactory`**: Creates synthetic tool results for error handling

**Resolvers Subpackage** (`tools/resolvers/`):
- **`CoordinateResolver`**: Routes coordinate resolution to OCR or Vision methods
- **`OcrResolver`**: Pure OCR text matching with fuzzy search (difflib)
- **`VisionResolver`**: Pure Vision model coordinate prediction using InternVL

**Key Features**:
- Coordinate resolution for `mouse_control` tools (OCR or Vision)
- Hidden screenshot workflow when visual context is missing
- Pure, testable resolver functions
- Error handling with synthetic results

### History Package (`history/`)

**Purpose**: Agent memory and state mutation.

**Components**:
- **`HistoryCommitter`**: Commits processed results into conversation history (state mutation only, no computation)

**Key Features**:
- Strict SRP: only state mutation, no logic
- Clean separation from result transformation

### Plugins Package (`plugins/`)

**Purpose**: Plugin system for extending agent functionality.

**Components**:
- **`AgentPlugin`**: Protocol interface for plugins
- **`PluginManager`**: Manages plugin lifecycle and hooks
- **`OCRPlugin`**: OCR analysis plugin implementation

**Key Features**:
- Hook-based extension points (`on_tool_end`, etc.)
- Plugin registry for discovery and management

## Design Principles

### Single Responsibility Principle (SRP)

Each component has exactly one reason to change:
- **InteractionLoop**: Only loop control and sequencing
- **PromptCoordinator**: Only prompt building and caching
- **LLMInteractionHandler**: Only LLM streaming and token counting
- **EventPresenter**: Only event formatting and emission
- **ResultTransformer**: Only pure data transformation
- **HistoryCommitter**: Only state mutation

### Separation of Concerns

- **Orchestration** vs **Execution**: `ToolExecutor` orchestrates, `ToolPreparer` executes
- **Transformation** vs **Mutation**: `ResultTransformer` transforms, `HistoryCommitter` mutates
- **Presentation** vs **Business Logic**: `EventPresenter` formats, components make decisions

### Pure Functions

Several components are explicitly pure (side-effect free):
- **`ResultTransformer`**: No session access, no history mutation, no IO, no events
- **`OcrResolver`**: Pure text matching, receives data as parameters
- **`VisionResolver`**: Pure coordinate prediction, receives service as parameter

### Thread Safety

- **`SessionManager`**: Uses per-user locks to prevent race conditions during session creation
- **`AgentSession`**: Uses internal locks for config updates and query processing

## Import Patterns

### Top-Level Imports

```python
from backend.src.agent import (
    AgentSession,
    AgentExecutor,
    InteractionLoop,
    PromptCoordinator,
    LLMInteractionHandler,
    EventPresenter,
    ToolExecutor,
    ToolPreparer,
    ResultTransformer,
    HistoryCommitter,
    # ... etc
)
```

### Subpackage Imports

```python
from backend.src.agent.core import AgentSession, AgentExecutor
from backend.src.agent.llm import PromptCoordinator, LLMInteractionHandler
from backend.src.agent.tools import ToolExecutor, ToolPreparer
from backend.src.agent.tools.resolvers import CoordinateResolver, OcrResolver
from backend.src.agent.history import HistoryCommitter
```

## Component Interactions

### Execution Flow

```
AgentExecutor
  └──> InteractionLoop (state machine)
        ├──> PromptCoordinator (get prompt)
        ├──> LLMInteractionHandler (stream response)
        ├──> ResponseParser (parse tool calls)
        ├──> ToolExecutor (execute tools)
        │     ├──> ToolPreparer (prepare tools)
        │     │     ├──> ScreenshotManager (get screenshot)
        │     │     ├──> OcrCoordinator (get OCR results)
        │     │     └──> CoordinateResolver (resolve coordinates)
        │     ├──> ToolOrchestrator (execute tools)
        │     ├──> ResultTransformer (transform results)
        │     └──> HistoryCommitter (commit to history)
        └──> EventPresenter (format events)
```

### Data Flow

1. **User Query** → `AgentExecutor.process_query()`
2. **Prompt Building** → `PromptCoordinator.get_prompt()` (cached after first iteration)
3. **LLM Interaction** → `LLMInteractionHandler.get_response()` (streams events)
4. **Response Parsing** → `ResponseParser.parse_response()`
5. **Tool Preparation** → `ToolPreparer.prepare_tools()` (coordinate resolution if needed)
6. **Tool Execution** → `ToolOrchestrator.execute_tools_from_response()`
7. **Result Processing** → `ResultTransformer.transform()` → `HistoryCommitter.commit()`
8. **Event Presentation** → `EventPresenter.present_*()` methods

## Benefits of This Structure

1. **Discoverability**: Clear organization makes it easy to find components
2. **Maintainability**: Each component has a single, clear responsibility
3. **Testability**: Pure functions and clear boundaries enable easy unit testing
4. **Scalability**: Easy to add new resolvers, plugins, or tool types
5. **Clarity**: Import paths reflect component relationships
6. **Isolation**: Changes to one component don't affect others unnecessarily

## Migration Notes

If you're updating code that references the old structure:

- `backend/src/agent/core.py` → `backend/src/agent/core/core.py`
- `backend/src/agent/executor.py` → `backend/src/agent/core/executor.py`
- `backend/src/agent/interaction_loop.py` → `backend/src/agent/core/interaction_loop.py`
- `backend/src/agent/state.py` → `backend/src/agent/core/state.py`
- `backend/src/agent/session_manager.py` → `backend/src/agent/core/session_manager.py`
- `backend/src/agent/prompt_coordinator.py` → `backend/src/agent/llm/prompt_coordinator.py`
- `backend/src/agent/llm_interaction_handler.py` → `backend/src/agent/llm/llm_interaction_handler.py`
- `backend/src/agent/event_presenter.py` → `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/tool_executor.py` → `backend/src/agent/tools/tool_executor.py`
- `backend/src/agent/tool_preparer.py` → `backend/src/agent/tools/tool_preparer.py`
- `backend/src/agent/result_transformer.py` → `backend/src/agent/tools/result_transformer.py`
- `backend/src/agent/history_committer.py` → `backend/src/agent/history/history_committer.py`
- `backend/src/agent/coordinate_resolvers.py` → `backend/src/agent/tools/resolvers/coordinate_resolvers.py`

Use top-level imports from `backend.src.agent` for backward compatibility, or update to subpackage imports for explicit paths.
