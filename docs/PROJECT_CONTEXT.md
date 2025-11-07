# Desktop Assistant - Complete Project Context Document

## Executive Summary

Desktop Assistant is an AI-powered personal assistant application for Windows that fundamentally reimagines human-computer interaction. It uses Large Language Models (LLMs) to understand natural language requests, maintains persistent memory of user activities and conversations, can execute commands and automate tasks through a tool marketplace, and operates via both voice and text interfaces. The core innovation is creating a unified, context-aware agent that eliminates the need for users to repeatedly explain context or possess technical knowledge to perform advanced computer operations.

---

## Problem Statement

### Current Pain Points
1. **Context Switching**: Users constantly switch between their work and ChatGPT/Claude to ask questions, requiring them to manually provide context each time
2. **Technical Barriers**: Non-technical users (especially elderly) struggle with computer troubleshooting, command-line operations, and complex workflows
3. **Fragmented Memory**: AI assistants don't remember past conversations or know what the user is working on
4. **Manual Execution**: Even when AI provides instructions, users must manually execute each step
5. **Untapped Potential**: Most users utilize only a fraction of their computer's capabilities due to complexity

### Target Users
- **Primary**: Non-technical users who want to leverage their computer's full potential without learning commands
- **Secondary**: Developers who want to automate workflows and reduce context-switching
- **Tertiary**: Elderly users who need computer assistance
- **General**: Anyone who asks LLMs questions while working on their computer

---

## Solution Overview

Desktop Assistant is a locally-running application that combines:

1. **LLM-Powered Agent**: Intelligent orchestrator that understands requests and decides on actions
2. **Persistent Memory System**: Stores conversation history and optionally monitors user activity
3. **Tool Marketplace**: Extensible system where tools (capabilities) can be added by developers
4. **Voice Interface**: Natural interaction via speech-to-text and text-to-speech
5. **Computer Control**: Can execute commands, manipulate files, and control applications
6. **Privacy-First Design**: All data stored locally, user has complete control

---

## Core Features (Detailed)

### 1. Persistent Memory System

#### Types of Memory
- **Episodic Memory**: Specific events and interactions
  - "User edited `orchestrator.py` at 3:45 PM yesterday"
  - "User asked about Python decorators on Monday"
  - Stored with timestamps, metadata, and context

- **Semantic Memory**: Facts and knowledge learned about the user
  - "User is working on a project called 'desktop-assistant'"
  - "User prefers Python over JavaScript"
  - "User's main work directory is C:\Users\Username\Projects"

- **Procedural Memory** (planned for later phases): Learned workflows
  - "When user says 'start work', open VSCode, Slack, and Chrome"
  - Common patterns and automations learned from observation

#### Memory Modes

**Passive Mode** (Default initially):
- Records only direct interactions with the assistant
- Stores conversation history
- Lower privacy concern, minimal resource usage
- User explicitly tells the agent what they're doing

**Active Mode** (Advanced feature):
- Continuously monitors user activity
- Captures:
  - Active window titles and application names
  - File system changes (files created, modified, deleted)
  - Optionally: periodic screenshots with OCR
  - Optionally: clipboard activity
  - Browser history and active tabs
- Processes and indexes this data for semantic search
- Privacy controls allow excluding specific apps/folders
- Can be toggled on/off at will

#### Memory Retrieval
- **Semantic Search**: Uses embeddings to find relevant memories based on meaning
- **Temporal Search**: "What did I do yesterday at 3 PM?"
- **Context-Aware**: Agent automatically retrieves relevant memories when processing requests
- **User-Initiated**: User can explicitly ask "What was I working on last week?"

#### Privacy Controls
- **Visibility**: Memory viewer shows everything stored
- **Deletion**: User can delete any memory (single item, date range, by topic)
- **Exclusions**: Blacklist specific apps from monitoring (e.g., banking apps, password managers)
- **Retention**: Configurable data retention policies
- **Export**: Full data export in portable formats (JSON, CSV, Markdown)

### 2. Multi-Provider LLM Integration

#### Supported Providers
- **OpenAI**: GPT-4o, GPT-4.1
- **Anthropic**: Claude 3.7 Sonnet, Claude Sonnet 4
- **Google**: Gemini Pro, Gemini Ultra
- **OpenRouter**: Access to 100+ models through unified API
- **Mistral AI**: Mistral Large and other Mistral models
- **Local Models**: Integration with local LLM providers is supported through OpenAI-compatible server interfaces. This includes:
  - **Ollama**: For running models like Llama 3, Gemma, etc.
  - **LM Studio**: For a wide variety of community-provided models.

#### Provider Abstraction
- Unified interface regardless of provider
- Automatic handling of provider-specific quirks
- Retry logic with exponential backoff
- Fallback to alternative providers on failure
- Rate limiting awareness
- Token usage tracking for cost management

#### Configuration
- **Implementation**: Configuration is managed by a `config.yaml` file stored in the user's OS-specific application data directory.
- **Security**: API keys are handled securely by storing the *name* of the environment variable (e.g., `OPENAI_API_KEY`) in the config file, not the key itself. The backend loads the key from the environment at runtime.
- **Flexibility**: Supports defining multiple LLM providers and allows the user to select the active provider through the settings panel.
- **Persistence**: Changes made in the settings UI are saved to the `config.yaml` file and persist between sessions.

#### Configuration System (Excruciating Detail)
The configuration is managed by `backend/config.py` using Pydantic for validation and a singleton pattern for access, ensuring consistency and robustness.

**1. Pydantic Models for Validation:**
- The entire configuration structure is defined by Pydantic models (e.g., `AppConfig`, `LLMProviders`, `OpenAIConfig`).
- This ensures that any loaded configuration is automatically validated against a strict schema. If the `config.yaml` file is malformed or missing fields, the system logs an error and gracefully falls back to default values, preventing crashes.

**2. Singleton Access Pattern:**
- The `get_settings()` function provides global access to the configuration.
- On its first call, it loads the `config.yaml` file into a cached `settings` object. Subsequent calls return the cached object, preventing repeated and unnecessary file I/O.
- `reload_settings()` can be called to force a re-read from the disk, which is used after settings are updated.

**3. Secure API Key Handling:**
- The `config.yaml` file **never** stores raw API keys. Instead, it stores the name of the environment variable that holds the key (e.g., `api_key_env: "OPENAI_API_KEY"`).
- The `load_api_key_for_provider` function is called when settings are loaded or updated. It reads the appropriate `..._env` field for the currently active provider and fetches the key from the environment using `os.getenv()`.
- The key is then stored in a `api_key` field on the `AppConfig` model, which is explicitly marked to be excluded from being saved back to the YAML file. This ensures keys remain only in the environment and in memory during runtime.

**4. Dynamic Model Naming:**
- The `AppConfig.llm_model` is a `@property` that dynamically constructs the model identifier required by the `LiteLLMClient`.
- For `local` mode, it returns the `selected_model_id` directly (e.g., `"llama3"`).
- For `online` mode, it prepends the provider name (e.g., `"openai/gpt-4o"`), forming the identifier that LiteLLM uses to route the request to the correct API.

**5. Deprecation of Old Functions:**
- The file contains several deprecated functions (`get_model_id`, `set_provider`, etc.). The new, preferred method is to get the singleton object via `get_settings()` and modify its properties directly before saving (e.g., `settings = get_settings(); settings.model_provider = "anthropic"; save_settings_to_file(settings)`).

**6. Service Layer Architecture:**
- The `AppServices` class provides a service container that wraps the configuration and provides access to various application services.
- **WorkspaceContext**: Handles workspace path validation with `is_path_within_workspace()` method using `is_within_directory()` utility.
- **FileService**: Provides file filtering logic with `should_ignore_file()` method for common patterns (`.git`, `__pycache__`, `node_modules`, etc.).
- **StorageService**: Manages temporary directories and storage operations.
- Tools receive an `AppServices` instance instead of raw config, providing clean separation between configuration data and service logic.
- This architecture enables tools to access workspace-aware services while maintaining proper encapsulation.

### 3. Tool Marketplace Architecture

#### What is a Tool?
A tool is a discrete capability that the agent can invoke to perform actions beyond text generation. Examples:
- Terminal executor (run shell commands)
- File operations (read, write, search files)
- Computer use automation (control mouse/keyboard/UI)
- Web browser control
- API integrations (weather, email, calendar)
- Custom user-created tools

#### Tool Manifest Schema
Every tool includes a JSON manifest with:

```json
{
  "name": "terminal_executor",
  "version": "1.0.0",
  "description": "Executes terminal commands on Windows (PowerShell/CMD)",
  "author": "Desktop Assistant Team",
  "category": "system",
  "permissions": ["filesystem", "process_execution"],
  "is_destructive": true,
  "input_schema": {
    "command": {
      "type": "string",
      "description": "The command to execute",
      "required": true
    },
    "working_directory": {
      "type": "string",
      "description": "Directory to execute command in",
      "required": false
    }
  },
  "output_schema": {
    "stdout": "string",
    "stderr": "string",
    "exit_code": "integer"
  },
  "memory_payload": {
    "description": "What the agent should remember about this execution",
    "format": "Command executed: {command}, Exit code: {exit_code}, Output summary: {summary}"
  }
}
```

#### Tool Discovery & Selection
1. User makes a request: "Search for Python files in my projects folder"
2. Agent recognizes this requires a tool
3. Agent searches tool registry using semantic search
4. Finds relevant tools (file search tool, grep tool, etc.)
5. Agent selects best tool based on descriptions and capabilities
6. Agent formats parameters based on input schema
7. Agent invokes tool through executor

#### Tool Execution
- **Sandboxing**: Tools run in isolated environment (subprocess with timeout)
- **Timeout**: Configurable timeout prevents hanging (default 30s)
- **Resource Limits**: Optional CPU/memory constraints
- **Permission System**: Tools declare required permissions, user can review
- **Error Handling**: Exceptions caught, serialized, returned to agent
- **Logging**: All executions logged for auditing

#### Automatic Schema Generation
**✅ IMPLEMENTED**: Tools now use automatic JSON schema generation from Python type hints and function signatures.

```python
# Tool methods are defined with type hints:
async def execute_async(
    self,
    context: ToolContext,
    path: str,                    # Required parameter
    offset: Optional[int] = None, # Optional parameter
    limit: Optional[int] = None   # Optional parameter
) -> ToolResult:
    pass

# Automatically generates schema:
{
  "name": "read_file",
  "description": "...",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {"type": "string", "description": "Parameter path"},
      "offset": {"type": "number", "description": "(optional)"},
      "limit": {"type": "number", "description": "(optional)"}
    },
    "required": ["path"]
  }
}
```

This eliminates manual schema maintenance and ensures schemas always match implementation.

#### Tool Development Guide

This section provides a comprehensive guide for developers who want to add new tools to the Desktop Assistant system. Whether you're adding built-in tools to the core system or creating community tools for the marketplace, follow this step-by-step guide.

---

### **Step 1: Choose Tool Location**

**Built-in Tools** (for core functionality):
- Location: `backend/tools/`
- Example: `read_file`, `write_file`, `run_shell_command`
- Requirements: High code quality, comprehensive tests, security review
- Use Case: Essential functionality used by most users

**Community Tools** (for marketplace):
- Location: `tools/verified/` or `tools/community/`
- Example: `weather_lookup`, `send_email`, `database_query`
- Requirements: Security review, user confirmation for destructive operations
- Use Case: Specialized functionality or third-party integrations

---

### **Step 2: Implement the Tool Class**

All tools must inherit from the `Tool` base class and implement the required interface.

#### **Basic Tool Structure**

```python
from backend.tools.base import Tool, ToolContext, ToolResult
from typing import Optional

class MyTool(Tool):
    """Description of what this tool does."""

    @property
    def name(self) -> str:
        return "my_tool"

    @property
    def description(self) -> str:
        return "Brief description for the LLM to understand when to use this tool"

    @property
    def kind(self) -> Tool.Kind:
        return Tool.Kind.FILESYSTEM  # or .SHELL, .WEB, .UTILITY, etc.

    async def execute_async(
        self,
        context: ToolContext,
        # Define your parameters with type hints
        param1: str,
        param2: Optional[int] = None
    ) -> ToolResult:
        """
        Execute the tool's main functionality.

        Args:
            context: Tool execution context
            param1: Description of parameter 1
            param2: Description of parameter 2 (optional)

        Returns:
            ToolResult with success status and output
        """
        try:
            # Your tool implementation here
            result = perform_operation(param1, param2)

            return ToolResult(
                success=True,
                llm_content=f"Operation completed successfully. Result: {result}",
                return_display=f"Result: {result}"
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Tool execution failed: {str(e)}",
                llm_content=f"Error: {str(e)}",
                return_display=f"Failed: {str(e)}"
            )
```

#### **Tool Kinds Available**

```python
class Kind(Enum):
    READ = "read"        # Reading operations (files, data)
    EDIT = "edit"        # Editing/modification operations
    DELETE = "delete"    # Deletion operations
    MOVE = "move"        # Moving/renaming operations
    SEARCH = "search"    # Search operations
    EXECUTE = "execute"  # Command execution
    THINK = "think"      # Reasoning/processing operations
    FETCH = "fetch"      # Data fetching operations
    OTHER = "other"      # Miscellaneous operations
```

#### **Parameter Validation**

Override `validate_parameters` for custom validation:

```python
def validate_parameters(self, **kwargs) -> list[str]:
    """Validate tool parameters. Return list of error messages."""
    errors = []

    if 'required_param' not in kwargs:
        errors.append("required_param is required")

    if 'number_param' in kwargs and not isinstance(kwargs['number_param'], int):
        errors.append("number_param must be an integer")

    if 'file_path' in kwargs:
        # Custom validation logic
        if not os.path.exists(kwargs['file_path']):
            errors.append("File does not exist")

    return errors
```

---

### **Step 3: Schema Generation (Automatic)**

**✅ NO MANUAL WORK REQUIRED!** The system automatically generates JSON schemas from your type hints.

```python
# This automatically generates:
{
  "name": "my_tool",
  "description": "Brief description...",
  "parameters": {
    "type": "object",
    "properties": {
      "param1": {"type": "string", "description": "(optional)"},
      "param2": {"type": "number", "description": "(optional)"}
    },
    "required": ["param1"]  # Based on Optional[] vs required
  }
}
```

**Type Hint Examples:**
```python
# Required string
param: str

# Optional string with default
param: Optional[str] = None

# Required integer
count: int

# Optional list
items: Optional[List[str]] = None

# Union types
value: Union[str, int]
```

---

### **Step 4: Add Tool Capabilities (Optional)**

Implement `get_capabilities()` for advanced tool features:

```python
def get_capabilities(self) -> Dict[str, Any]:
    """Return tool capabilities for advanced features."""
    return {
        "kind": self.kind.value,
        "confirmation_required": True,  # Requires user approval
        "destructive": False,           # Can modify system state
        "timeout_seconds": 30,          # Execution timeout
        "supported_platforms": ["windows", "linux", "macos"]
    }
```

---

### **Step 5: Register the Tool**

#### **For Built-in Tools:**
Add to `backend/tools/tool_registry.py`:

```python
from backend.tools.my_tool import MyTool

def _register_builtin_tools(self) -> None:
    """Register all built-in tools."""
    # ... existing tools ...
    self.register_tool(MyTool(self.services))  # Tools receive AppServices instance
```

#### **For Community Tools:**
Create directory structure in `tools/verified/my_tool/`:
```
tools/verified/my_tool/
├── manifest.json    # Tool metadata
├── tool.py         # Tool implementation
├── __init__.py     # Package marker
└── README.md       # Documentation
```

---

### **Step 6: Write Comprehensive Tests**

Create test file in `tests/backend/test_my_tool.py`:

```python
"""Tests for MyTool."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.config import AppConfig
from backend.tools.base import ToolContext
from backend.tools.my_tool import MyTool


@pytest.fixture
def mock_config():
    """Create mock configuration."""
    return MagicMock(spec=AppConfig)


class TestMyTool:
    """Test cases for MyTool."""

    @pytest.mark.asyncio
    async def test_successful_execution(self, mock_config):
        """Test successful tool execution."""
        tool = MyTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context=context,
            param1="test_value",
            param2=42
        )

        assert result.success is True
        assert "successfully" in result.llm_content.lower()

    @pytest.mark.asyncio
    async def test_error_handling(self, mock_config):
        """Test error handling."""
        tool = MyTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context=context,
            param1="invalid_value"
        )

        assert result.success is False
        assert result.error is not None

    def test_parameter_validation(self, mock_config):
        """Test parameter validation."""
        tool = MyTool(mock_config)

        # Valid parameters
        errors = tool.validate_parameters(param1="value")
        assert len(errors) == 0

        # Invalid parameters
        errors = tool.validate_parameters()  # Missing required param
        assert len(errors) > 0

    def test_tool_properties(self, mock_config):
        """Test tool metadata."""
        tool = MyTool(mock_config)

        assert tool.name == "my_tool"
        assert tool.description is not None
        assert len(tool.description) > 0

    def test_schema_generation(self, mock_config):
        """Test automatic schema generation."""
        tool = MyTool(mock_config)
        schema = tool.get_schema()

        assert "name" in schema
        assert "description" in schema
        assert "parameters" in schema
        assert schema["name"] == "my_tool"
```

---

### **Step 7: Security Considerations**

#### **Built-in Tool Security:**
- ✅ **Workspace Validation**: Ensure file operations stay within allowed directories
- ✅ **Command Allowlisting**: For shell tools, restrict allowed commands
- ✅ **Timeout Protection**: All operations have configurable timeouts
- ✅ **Resource Limits**: Prevent excessive CPU/memory usage

#### **Community Tool Security:**
- ⚠️ **Code Review**: All community tools undergo security review
- ⚠️ **Sandboxing**: Tools run in isolated subprocesses
- ⚠️ **Permission Declaration**: Tools must declare required permissions
- ⚠️ **User Confirmation**: Destructive operations require user approval

---

### **Step 8: Memory Payload (Optional)**

For tools that should store information in memory:

```python
async def execute_async(self, context: ToolContext, query: str) -> ToolResult:
    result = perform_search(query)

    return ToolResult(
        success=True,
        llm_content=f"Found {len(result.items)} items matching '{query}'",
        return_display=f"Search results: {result.items}",
        memory_payload={
            "action": "Performed search",
            "query": query,
            "result_count": len(result.items),
            "timestamp": datetime.now().isoformat(),
            "search_type": "web"
        }
    )
```

---

### **Step 9: Documentation**

Create comprehensive documentation:

```markdown
# My Tool

## Overview
Brief description of what this tool does and when to use it.

## Parameters
- `param1` (string, required): Description
- `param2` (integer, optional): Description

## Examples
- "Use my_tool to process data with param1='value'"
- "Run my_tool on file with param2=10"

## Security Notes
Any security considerations or permission requirements.

## Error Handling
Common error conditions and how they're handled.
```

---

### **Complete Example: Weather Tool**

```python
# backend/tools/weather_tool.py
import aiohttp
from backend.tools.base import Tool, ToolContext, ToolResult
from typing import Optional

class WeatherTool(Tool):
    """Get current weather information for a location."""

    @property
    def name(self) -> str:
        return "get_weather"

    @property
    def description(self) -> str:
        return "Retrieve current weather conditions and forecast for a city or location"

    @property
    def kind(self) -> Tool.Kind:
        return Tool.Kind.WEB

    async def execute_async(
        self,
        context: ToolContext,
        location: str,
        units: Optional[str] = "metric"
    ) -> ToolResult:
        try:
            # Weather API call (example)
            async with aiohttp.ClientSession() as session:
                async with session.get(f"https://api.weather.com/{location}") as response:
                    data = await response.json()

            weather_info = f"Weather in {location}: {data['temperature']}°C, {data['conditions']}"

            return ToolResult(
                success=True,
                llm_content=weather_info,
                return_display=weather_info,
                memory_payload={
                    "action": "Checked weather",
                    "location": location,
                    "temperature": data['temperature'],
                    "conditions": data['conditions']
                }
            )

        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Weather lookup failed: {str(e)}",
                llm_content=f"Unable to get weather information: {str(e)}",
                return_display=f"Weather error: {str(e)}"
            )

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "kind": self.kind.value,
            "confirmation_required": False,
            "destructive": False,
            "requires_network": True,
            "supported_units": ["metric", "imperial"]
        }
```

---

### **Testing Your Tool**

1. **Run Tests:**
   ```bash
   pytest tests/backend/test_my_tool.py -v
   ```

2. **Integration Testing:**
   ```bash
   # Start the backend
   python -m backend.server

   # Test via the UI or direct API calls
   ```

3. **Schema Validation:**
   ```python
   tool = MyTool(config)
   schema = tool.get_schema()
   print(json.dumps(schema, indent=2))  # Verify schema looks correct
   ```

---

### **Submission Process (Community Tools)**

1. **Create Tool Package** in `tools/community/my_tool/`
2. **Write Tests** in `tests/tools/test_my_tool.py`
3. **Create Pull Request** with documentation
4. **Security Review** by maintainers
5. **User Testing** period
6. **Promotion** to `tools/verified/` on approval

---

### **Best Practices**

1. **Type Hints**: Always use comprehensive type hints for automatic schema generation
2. **Error Handling**: Catch exceptions and provide meaningful error messages
3. **Validation**: Implement parameter validation to prevent misuse
4. **Documentation**: Write clear docstrings and usage examples
5. **Testing**: Cover success cases, error cases, and edge cases
6. **Security**: Consider security implications of all operations
7. **Performance**: Add timeouts and resource limits for long-running operations
8. **User Experience**: Provide clear, helpful output messages for the LLM

This guide ensures consistent, secure, and high-quality tool development across the Desktop Assistant ecosystem.

#### Memory Payload Innovation
Critical feature: Tools return not just results, but also a "memory payload" - structured information the agent should store in memory. This solves the problem of the agent not knowing what happened inside tool execution.

Example:
```python
# Tool executes command
result = subprocess.run(["git", "status"], capture_output=True)

# Tool returns both result AND memory context
return {
    "stdout": result.stdout,
    "stderr": result.stderr,
    "exit_code": result.returncode,
    "memory_payload": {
        "action": "Checked git status",
        "repository": "/path/to/repo",
        "changes": "3 modified files, 2 untracked files",
        "branch": "main"
    }
}
```

Agent stores this memory payload, so later when user asks "What was the git status?", agent can recall it.

### 4. Built-in Core Tools

#### ✅ IMPLEMENTED: File System Tools (Gemini CLI Integration)
- **ReadFile Tool**: Reads text files, images, PDFs with optional line ranges
  - Supports absolute and relative paths
  - Automatic encoding detection
  - Binary file handling (images/PDFs)
  - Large file truncation protection
- **ListDirectory Tool**: Lists directory contents with filtering
  - Glob pattern filtering
  - Gitignore/gitignore respect
  - Sorted output (directories first)
- **WriteFile Tool**: Creates/overwrites files
  - Automatic parent directory creation
  - Content validation
- **Glob Tool**: Finds files using glob patterns
  - Recursive searching
  - Multiple pattern support
  - Modification time sorting
- **SearchFileContent Tool**: Regex search within files
  - Git grep integration for speed
  - Include/exclude patterns
  - Line number reporting
- **Replace Tool**: Search/replace text in files
  - Fuzzy matching capabilities
  - Expected replacement validation
- **ReadManyFiles Tool**: Batch file reading
  - Multiple file processing
  - Concatenated output
  - Binary file filtering

#### ✅ IMPLEMENTED: Shell Command Tool
- **Purpose**: Execute PowerShell and CMD commands
- **Safety**: Command allowlisting and validation
- **Features**:
  - Captures stdout, stderr, exit codes
  - Supports working directory specification
  - Timeout protection (30s default)
  - Background process detection
  - Cross-platform compatibility

#### 🔄 PLANNED: Computer Use Automation (CUA) Tool
- **Purpose**: Control mouse, keyboard, and UI elements
- **Capabilities**:
  - Screenshot capture
  - Mouse movement and clicking (coordinates or element-based)
  - Keyboard input simulation
  - Window detection and manipulation
  - Scrolling
  - UI element detection (via accessibility APIs or computer vision)
  - OCR for text extraction from UI
- **Implementation Approaches**:
  - Windows UI Automation API (primary, most reliable)
  - Computer vision (fallback for apps without accessibility)
  - Browser automation (Playwright/Selenium for web)
- **Safety**:
  - Careful timing and synchronization
  - Failure detection and recovery
  - Confirmation for potentially destructive UI actions

### 5. Voice Interface

#### Speech-to-Text (STT)
- **Primary**: OpenAI Whisper (local model or API)
- **Alternatives**: Google Cloud Speech, Azure Speech, Vosk
- **Features**:
  - Voice Activity Detection (VAD) to detect speech start/end
  - Real-time transcription display
  - Support for various accents and languages
  - Noise filtering
  - Confidence scoring

#### Text-to-Speech (TTS)
- **Goal**: Natural-sounding voice responses
- **Options**:
  - Local: Coqui TTS, Piper TTS
  - Cloud: OpenAI TTS, Azure Neural Voices, Google Cloud TTS, ElevenLabs
- **Features**:
  - Multiple voice options
  - Adjustable speed and pitch
  - Streaming TTS (start speaking before full response generated)
  - Emotion/tone control

#### Wake Word Detection
- **Purpose**: Always-on, hands-free activation
- **Implementation**: Porcupine, OpenWakeWord, or custom trained model
- **Features**:
  - Low CPU usage (< 5%)
  - Customizable wake word
  - Local processing (privacy)
  - Visual/audio feedback on detection
  - Adjustable sensitivity

#### Voice UI
- **Push-to-Talk**: Manual button for voice input
- **Always-On**: Wake word activation
- **Visual Indicators**:
  - Listening state (passive vs active)
  - Processing state
  - Speaking state
  - Audio level visualization
- **Transcription Display**: Show recognized text in real-time

### 6. Agent Orchestrator (The "Brain")

#### Core Responsibilities
1. **Query Understanding**: Parse and understand user requests
2. **Context Assembly**: Retrieve relevant memories and conversation history
3. **Decision Making**: Decide whether to respond directly or use tools
4. **Tool Selection**: If tools needed, search and select appropriate ones
5. **Parameter Generation**: Format tool invocation parameters
6. **Execution Coordination**: Call tools, handle results, retry on failures
7. **Response Generation**: Integrate tool outputs into conversational response
8. **Memory Storage**: Store conversation and memory payloads

#### Prompt Engineering
System prompt includes:
- Role definition (helpful, persistent personal assistant)
- Capabilities description (tools available, memory access)
- Guidelines for tool usage
- Safety instructions
- Output formatting expectations
- Memory integration instructions

#### Decision Engine
Determines whether to:
- Respond directly (agent knows answer from training or memory)
- Use a tool (requires external action or data)
- Ask for clarification (ambiguous request)
- Request confirmation (potentially destructive action)

#### Context Management
- Limited context window (typically 8K-128K tokens depending on provider)
- Intelligent pruning of old messages
- Memory retrieval to supplement context
- Summarization of long conversations

#### Agent Orchestrator Logic (Excruciating Detail)
The core logic resides in the `Agent.process_query` method (`backend/agent/orchestrator.py`). It follows a sophisticated loop to enable tool usage, correction, and robust error handling.

**Step 1: Initialization & Query Validation**
1.  An `asyncio.Lock` is acquired to ensure only one query is processed at a time, preventing race conditions.
2.  The system checks if a model is selected in the configuration (`cfg.selected_model_id`). If not, it yields an error message and stops.
3.  The user's query is appended to the `self.history` list as a `{"role": "user", ...}` message.

**Step 2: The Tool-Calling Loop**
The agent enters a `while` loop that can run for a maximum of `MAX_TOOL_ITERATIONS` (currently 5) to prevent infinite loops of tool calls.

**Step 3: Prompt Construction**
1.  On the first iteration, `_construct_prompt` is called with `include_tools=True`.
2.  This method builds the prompt by combining:
    - The `SYSTEM_PROMPT` from `prompts.py`.
    - The JSON schemas of all registered tools, fetched from the `ToolRegistry`. This is crucial for the LLM to know what functions it can call.
    - The entire conversation `self.history`.
3.  In subsequent iterations (`>1`), tools are not included in the prompt, as the context is now about responding to the previous tool's output.

**Step 4: LLM Interaction & Streaming**
1.  The complete prompt is sent to the LLM via `_get_llm_response_stream`, which uses the `LiteLLMClient`.
2.  The method streams the response back, yielding `chunk` events for each piece of text received. This allows the UI to display the response as it's being generated.
3.  The full, concatenated response from the LLM is collected for parsing.

**Step 5: Response Parsing & Tool Call Validation**
1.  The complete LLM response is passed to the `ResponseParser`. This component uses multiple strategies (e.g., regex for function-like calls, JSON parsing) to find any tool calls within the text.
2.  The `_parse_and_validate_tool_calls` method iterates through the detected tool calls.
3.  It checks each tool name against the `ToolRegistry` to ensure it's a real, available tool. Any calls to non-existent tools are flagged as `invalid_calls`.
4.  A feedback message is added to the conversation history if any invalid tools were called, instructing the LLM on its mistake. If all calls were invalid, the loop continues, giving the LLM a chance to correct itself.

**Step 6: Handling Malformed Calls & Final Responses**
1.  **If no valid tool calls are found:**
    - The system checks if the response *looks like* a malformed attempt to call a tool (e.g., incorrect syntax).
    - If it's a malformed attempt on the first iteration, a system message is added to the history correcting the LLM's format, and the loop continues.
    - If it's not a tool-call attempt, the agent assumes this is the final, text-based answer for the user. The response is added to history as an `assistant` message, the history is pruned, and the loop breaks.
2.  **If valid tool calls are found:** The process continues to the next step.

**Step 7: Tool Execution**
1.  The `_execute_tools` method is called with the list of valid tool calls.
2.  It yields a `thinking` event to the frontend to show that tools are being executed.
3.  The `ToolOrchestrator` is invoked, which executes the tools concurrently.
4.  Upon completion, it yields a `tool_execution` event containing a summary and detailed results for each tool call.
5.  A detailed system message for *each* tool's result (success or failure) is appended to the conversation history. This is critical for the LLM to understand what happened and decide its next step.

**Step 8: Loop Continuation or Exit**
1.  If any tool failed, the `ToolExecutionError` is caught, and the loop continues, allowing the LLM to process the failure message and try a different approach.
2.  If all tools succeed, the loop continues to the next iteration. The LLM will now receive the tool execution results in the history and can decide whether to respond to the user, call another tool, or chain operations.
3.  The loop terminates if it reaches `MAX_TOOL_ITERATIONS` or if a final text response is generated.

**Step 9: Cleanup**
- The `asyncio.Lock` is released, allowing the next user query to be processed.

This detailed, stateful loop is the "brain" of the agent, enabling it to use tools, handle errors, learn from mistakes within a single conversation, and decide when a task is complete.
---

## Technical Architecture

### System Architecture Diagram (Conceptual)

```
┌─────────────────────────────────────────────────┐
│           Electron Frontend (UI)                │
│  ┌──────────────────────────────────────────┐  │
│  │  React Components                        │  │
│  │  - ChatInterface                         │  │
│  │  - VoiceControls                         │  │
│  │  - ThinkingDisplay                       │  │
│  │  - SettingsPanel                         │  │
│  │  - MemoryViewer                          │  │
│  └──────────────────────────────────────────┘  │
│                    ↕ IPC (WebSocket)            │
└─────────────────────────────────────────────────┘
                      ↕
┌─────────────────────────────────────────────────┐
│         Python Backend (Core Logic)             │
│  ┌──────────────────────────────────────────┐  │
│  │   Agent Orchestrator                     │  │
│  │   - LLM Client (Multi-provider)          │  │
│  │   - Decision Engine                      │  │
│  │   - Safety Checker                       │  │
│  └──────────────────────────────────────────┘  │
│             ↕              ↕           ↕         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────┐ │
│  │   Memory    │  │ Tool         │  │ Voice  │ │
│  │   System    │  │ Marketplace  │  │ Engine │ │
│  │             │  │              │  │        │ │
│  │ - Storage   │  │ - Registry   │  │ - STT  │ │
│  │ - Retrieval │  │ - Executor   │  │ - TTS  │ │
│  │ - Monitor   │  │ - Search     │  │ - Wake │ │
│  └─────────────┘  └──────────────┘  └────────┘ │
│                           ↕                      │
│                    ┌─────────────┐              │
│                    │   Tools     │              │
│                    │ - Terminal  │              │
│                    │ - FileOps   │              │
│                    │ - CUA       │              │
│                    └─────────────┘              │
└─────────────────────────────────────────────────┘
                      ↕
              ┌───────────────┐
              │  Windows OS   │
              │  - Filesystem │
              │  - Processes  │
              │  - UI/Display │
              └───────────────┘
```

### Technology Stack

#### Backend (Python 3.10+)
- **Core Framework**: Async Python (asyncio, websockets)
- **LLM Abstraction**:
  - `litellm` (provides a unified interface for multiple LLM providers)
  - Support for OpenAI, Anthropic, Google, Mistral, and local models
- **Tool System** ✅ IMPLEMENTED:
  - Custom tool framework with automatic schema generation from type hints
  - Tool registry and orchestrator for execution
  - Response parser for tool call detection with multi-strategy parsing
  - 8 built-in tools: 7 filesystem operations + 1 shell command tool
  - Workspace validation and security controls
- **Voice** 🔄 PLANNED:
  - `openai-whisper` or `whisper` library (STT)
  - `coqui-tts` or cloud TTS APIs
  - `pvporcupine` or `openwakeword` (wake word)
- **Memory** 🔄 PLANNED:
  - Vector database: ChromaDB, FAISS, or Qdrant
  - `sentence-transformers` for embeddings
  - SQLite for structured data
- **Computer Control** 🔄 PLANNED:
  - `pywinauto` (Windows UI Automation)
  - `pyautogui` (mouse/keyboard)
  - `mss` or `PIL` (screenshots)
  - `pytesseract` or `easyocr` (OCR)
- **File Processing** ✅ IMPLEMENTED:
  - `python-magic-bin` (file type detection)
  - Custom file utilities for encoding detection and content reading
- **System** ✅ IMPLEMENTED:
  - `pywin32` (Windows APIs)
  - Configuration management with YAML and Pydantic validation
- **Web** ✅ IMPLEMENTED:
  - `websockets` (WebSocket server for IPC)
- **Testing**:
  - `pytest` (unit and integration tests)
  - `pytest-asyncio` (async tests)

#### Frontend (Electron + React)
- **Framework**: Electron (desktop app framework)
- **UI**: React 18+ with hooks
- **Build Tool**: Vite (fast builds, HMR)
- **State Management**: Context API, Zustand, or Jotai
- **Styling**: CSS Modules, Tailwind, or styled-components
- **IPC**: WebSocket client connecting to Python backend
- **Audio**: Web Audio API for voice visualizations
- **Testing**:
  - Jest + React Testing Library (unit tests)
  - Playwright or Spectron (E2E tests)

#### Frontend Architecture (Excruciating Detail)
The frontend is a single-page application built with React and running inside an Electron renderer process. Its architecture is centered around a main `App.jsx` component that orchestrates state and passes data to child components, with complex logic encapsulated in custom hooks.

**1. `App.jsx` - The Root Component**
- **Role**: Serves as the top-level container for the entire UI.
- **State Management**: It holds all the primary application state using `useState`, including `messages`, `isSending` (to disable UI during a query), `thinkingStatus`, `config`, `availableModels`, and `saveStatus`.
- **Event Handlers**: It defines the core event handlers, such as `handleSendMessage` (which sends a `query` message to the backend) and `handleConfigChange` (which sends an `update-settings` message).
- **Prop Drilling**: It passes state and event handlers down to its children (`MainLayout`, `ChatInterface`, `SettingsPanel`). A `TODO` note exists in the code to refactor this to a more scalable state management solution like Zustand in the future.

**2. Custom Hooks - The Logic Layer (`frontend/src/renderer/hooks/`)**
The majority of the frontend's logic is cleanly separated into custom hooks, promoting reusability and separation of concerns.

- **`useInitialConfig.js`**:
  - **Purpose**: To initialize the application's configuration when it first loads.
  - **Logic**: It contains a single `useEffect` with an empty dependency array, meaning it runs only once on component mount. It sends two messages to the backend: `load-settings` and `list-models`. This populates the settings panel with the user's saved configuration and the available LLM models.

- **`useMessageHandling.js`**:
  - **Purpose**: This is the central message hub for all communication coming *from* the backend.
  - **Logic**: It sets up a single `window.ipc.on('from-backend', ...)` listener. Inside this listener, it acts as a router, inspecting the `type` of the incoming message and calling the appropriate handler from the other, more specialized hooks (`useStreamingMessages` and `useSettingsManagement`). This hook is the bridge between the raw IPC messages and the stateful logic of the application.
  - **Message Types Handled**: Routes `streaming-response`, `streaming-complete`, `tool-call`, `tool-output`, `llm-thought`, `pong`, `response`, `settings-loaded`, `models-listed`, `settings-updated`, and `error` messages to their respective handlers.

- **`useStreamingMessages.js`**:
  - **Purpose**: To handle the real-time display of the agent's responses, including streaming text, tool calls, tool outputs, and thinking-status updates.
  - **Logic**:
    - `handleStreamingResponse`: When a `streaming-response` message arrives, it finds the last message in the `messages` array (which is the incomplete assistant message) and appends the new text `chunk` to it. This creates the "typing" effect. Only appends to messages with type `llm-text`.
    - `handleToolCall`: Creates a new message with type `tool-call` when the LLM requests a tool, displaying the JSON function call in a green-styled container.
    - `handleToolOutput`: Creates a new message with type `tool-output` when a tool execution completes, displaying the result in an orange-styled container.
    - `handleLlmThought`: Updates the `thinkingStatus` state, which is displayed in a dedicated `ThinkingDisplay` component.
    - `handleStreamingComplete`: This message signals the end of a query. The hook sets `isSending` to `false` (re-enabling the input) and clears the `thinkingStatus`.

- **`useSettingsManagement.js`**:
  - **Purpose**: To manage the state and interactions of the `SettingsPanel`.
  - **Logic**:
    - `handleSettingsLoaded`: Populates the `config` state with the data received from the backend.
    - `handleModelsListed`: Populates the `availableModels` state, which is used to build the model selection dropdowns.
    - **Optimistic Updates & Error Handling**: When settings are changed in the UI, the `handleConfigChange` function in `App.jsx` first *optimistically* updates the local state and sets the `saveStatus` to `"saving"`. The `useSettingsManagement` hook then handles the `settings-updated` confirmation from the backend (setting status to `"success"`) or an `error` message (setting status to `"error"` and reverting the change). It includes a 10-second timeout as a fallback in case the backend never responds.

**3. UI Components (`frontend/src/renderer/components/`)**
- **`ChatInterface.jsx`**: A presentational component that receives the `messages` array and renders it with different visual styles based on message type (`llm-text`, `tool-call`, `tool-output`). It also contains the input form for sending new messages. The component uses `renderMessageContent()` to determine the appropriate rendering style for each message type.
- **`SettingsPanel.jsx`**: A component that receives the `config` and `availableModels` objects and renders the various settings controls (dropdowns, text inputs). It calls the `onConfigChange` handler when a setting is modified.
- **`ThinkingDisplay.jsx`**: A simple component that displays the current `thinkingStatus` message, giving the user visibility into the agent's internal state (e.g., "Executing tool: read_file...").
- **`MainLayout.jsx`**: Provides the main two-column structure of the application (chat on the left, settings on the right).

This architecture effectively separates the view layer (components), the state and IPC logic (hooks), and the main application container (`App.jsx`), making the frontend organized and maintainable.

#### Development Tools
- **Python**:
  - `black` (code formatting)
  - `pylint` (linting)
  - `mypy` (type checking)
  - `isort` (import sorting)
- **JavaScript**:
  - `eslint` (linting)
  - `prettier` (formatting)
- **Git**:
  - `pre-commit` (git hooks)
  - Conventional Commits standard
- **CI/CD**: GitHub Actions

### Repository Structure

```
.
├── .env
├── .gitignore
├── .pre-commit-config.yaml
├── .github/
│   └── workflows/              # CI/CD workflows
│       ├── ci.yml                # CI/CD pipeline
│       └── release.yml           # Release automation
│
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       ├── feature_request.md
│       └── milestone_issue.md
│
├── backend/                    # Python backend ✅ IMPLEMENTED
│   ├── agent/                  # Main agent logic ✅ IMPLEMENTED
│   │   ├── orchestrator.py    # Core agent brain with tool calling loop
│   │   ├── llm_client.py      # Multi-provider LLM interface (LiteLLM)
│   │   ├── model_registry.py  # Model discovery and management
│   │   ├── prompts.py         # System prompts and templates
│   │   ├── response_parser.py # Tool call detection in LLM responses
│   │   └── tool_orchestrator.py # Tool execution coordination
│   │
│   ├── memory/                 # Memory system 🔄 PLANNED
│   │   ├── interface.py        # Abstract memory interface (empty)
│   │   ├── active_monitor.py   # Screen/activity capture (empty)
│   │   ├── passive_store.py    # Conversation storage (empty)
│   │   └── retrieval.py        # Query and context retrieval (empty)
│   │
│   ├── marketplace/            # Tool marketplace 🔄 PARTIALLY IMPLEMENTED
│   │   ├── registry.py         # Tool database (basic)
│   │   ├── executor.py         # Tool execution engine (basic)
│   │   ├── search.py           # Tool discovery (basic)
│   │   └── schema.py           # Tool schema definitions (basic)
│   │
│   ├── tools/                  # Built-in tools ✅ IMPLEMENTED
│   │   ├── base.py             # Base tool class + auto schema generation
│   │   ├── filesystem/         # File operations (7 tools) ✅ IMPLEMENTED
│   │   │   ├── data_structures.py    # Common data classes
│   │   │   ├── list_directory_tool.py
│   │   │   ├── read_file_tool.py
│   │   │   ├── write_file_tool.py
│   │   │   ├── glob_tool.py
│   │   │   ├── search_file_content_tool.py
│   │   │   ├── replace_tool.py
│   │   │   ├── read_many_files_tool.py
│   │   │   └── __init__.py
│   │   ├── shell.py            # Shell command execution ✅ IMPLEMENTED
│   │   ├── tool_registry.py    # Tool registry and management ✅ IMPLEMENTED
│   │   └── __init__.py
│   │
│   ├── utils/                  # Utility modules ✅ IMPLEMENTED
│   │   ├── file_utils.py       # File processing utilities
│   │   ├── schema_generator.py # Automatic JSON schema generation
│   │   └── __init__.py
│   │
│   ├── voice/                  # Voice processing 🔄 PLANNED
│   │   ├── stt.py              # Whisper integration (empty)
│   │   ├── tts.py              # TTS implementation (empty)
│   │   └── audio_manager.py    # Audio I/O (empty)
│   │
│   ├── server.py               # IPC server (WebSocket) ✅ IMPLEMENTED
│   ├── config.py               # Configuration management & service layer ✅ IMPLEMENTED
│   ├── requirements.txt        # Python dependencies ✅ IMPLEMENTED
│   ├── pyproject.toml          # Black and Isort configuration ✅ IMPLEMENTED
│   └── __init__.py
│
├── frontend/                   # Electron app
│   ├── src/
│   │   ├── main/              # Main process
│   │   │   ├── index.js       # Entry point
│   │   │   └── ipc.js         # IPC with backend
│   │   │
│   │   ├── renderer/          # Renderer process
│   │   │   ├── App.jsx        # Main React component
│   │   │   ├── components/    # UI components
│   │   │   │   ├── ChatInterface.jsx
│   │   │   │   ├── VoiceControls.jsx
│   │   │   │   ├── ThinkingDisplay.jsx
│   │   │   │   ├── ConfirmationDialog.jsx
│   │   │   │   └── SettingsPanel.jsx
│   │   │   └── styles/        # CSS styles
│   │   │
│   │   └── preload.js         # Preload script
│   │
│   ├── package.json            # Node.js dependencies and scripts
│   ├── vite.config.js          # Vite configuration
│   ├── .eslintrc.cjs           # ESLint configuration
│   └── .prettierrc.cjs         # Prettier configuration
│
├── tools/                      # Marketplace tools (separate from built-in)
│   └── verified/
│       └── example_tool/
│           ├── manifest.json   # Tool metadata
│           ├── tool.py         # Tool implementation
│           └── README.md       # Tool-specific documentation
│
├── docs/                       # Documentation
│   ├── ROADMAP.md                # Development timeline
│   ├── architecture.md           # System design
│   ├── user-guide.md             # User documentation
│   ├── developer-guide.md        # Contributor guide
│   ├── tool-development.md       # Tool creation guide
│   ├── api_reference.md          # API docs
│   ├── CODE_STANDARDS.md         # Project coding standards
│   └── project_context.md        # This file
│
├── tests/                      # Test suite
│   ├── backend/                # Backend tests
│   └── frontend/               # Frontend tests
│
├── README.md                   # Project overview
├── CONTRIBUTING.md             # Contribution guidelines
├── CODE_STANDARDS.md           # Project coding standards
├── LICENSE                     # Project license
```

### Inter-Process Communication (IPC)

Communication between the frontend and backend is handled via a WebSocket connection. All messages are JSON objects with a consistent structure.

For a detailed description of the message types, structure, and examples, see the dedicated **[IPC Protocol Document](ipc_protocol.md)**.

#### IPC Implementation Details

The IPC is managed by two key components working in tandem: the Python WebSocket server (`backend/server.py`) and the Electron IPC bridge (`frontend/src/main/ipc.cjs`).

**Backend: `server.py`**
- **Connection Handling**: The `handler` function manages the lifecycle of each client connection. It adds new clients to a global `connected_clients` set and removes them on disconnection.
- **Message Routing**: The `_handle_message` function acts as a router, inspecting the `type` field of incoming JSON messages and dispatching them to the appropriate handler function (e.g., `_handle_query`, `_handle_update_settings`).
- **State Management**: The server holds a singleton instance of the `Agent` class. Asynchronous locks (`agent_lock`, `settings_lock`) are used to prevent race conditions when updating the agent's configuration or processing multiple requests.
- **Asynchronous Operations**: The entire server is built on `asyncio` and `websockets`, allowing it to handle multiple clients and long-running agent tasks (like LLM calls) without blocking.

**Frontend: `ipc.cjs`**
- **WebSocket Client**: This script, running in Electron's main process, establishes and maintains a WebSocket connection to the Python backend.
- **Auto-Reconnection**: The `connect` function includes a `setTimeout` to automatically attempt reconnection if the connection is lost, making the system resilient to backend restarts.
- **Renderer-to-Main Bridge**: It uses Electron's `ipcMain.on('to-backend', ...)` to listen for messages sent from the React renderer process (the UI).
- **Message Forwarding**:
  1.  When a message is received from the renderer, it's wrapped in the standard JSON structure (with a UUID and timestamp) and forwarded to the Python backend via the WebSocket.
  2.  When a message is received from the backend WebSocket, it's forwarded directly to the renderer process using `mainWindow.webContents.send('from-backend', data)`. This triggers updates in the React UI.
- **Initialization**: The `initializeIpc` function is called once when the main Electron window is created, starting the entire communication flow.

---

## Development Approach & Philosophy

### Research-First Methodology
Each issue includes "Research Areas" rather than prescriptive solutions. Developers are expected to:
1. Research best practices and existing solutions
2. Review open-source projects solving similar problems
3. Read relevant documentation and papers
4. Propose an approach based on findings
5. Implement and iterate

This approach ensures:
- Team learns deeply rather than just following instructions
- Solutions are well-informed and up-to-date
- Multiple perspectives are considered
- Technical debt is minimized

### Code Quality Standards
- **Adherence to Standards**: All contributions must strictly follow the `CODE_STANDARDS.md` document. This includes providing comprehensive tests, writing clear docstrings, aligning with existing code patterns, and using the Conventional Commits format for all commit messages.
- **Readability**: Code is written for humans first
- **Consistency**: Follow established patterns
- **Documentation**: Public APIs documented, complex logic explained
- **Testing**: Comprehensive test coverage
- **Security**: Security considerations in every design decision

### Iterative Development
- Build MVPs of features
- Get feedback early and often
- Refactor as understanding deepens
- Don't over-engineer prematurely

### Community-Driven
- Open source from day one
- Welcome contributions of all sizes
- Clear contribution guidelines
- Supportive code review culture
- Documentation as important as code

---

## Practical Development Workflow & Known Issues

This section contains practical, hands-on advice and documents known issues to streamline the development process. All contributors should read this section before writing code.

### Running the Application

**Note for AI Assistant:** The user will be responsible for running the backend and frontend servers. Do not attempt to start them yourself. Follow the user's lead on this.

To run the application for testing, you must start the backend and frontend separately from the correct directories.

**1. Start the Backend Server:**
- Navigate to the **project root directory**.
- Run the server as a Python module to ensure all imports work correctly. This avoids `ModuleNotFoundError`.
- **Command**:
  ```bash
  # From /<project-root>/
  python -m backend.server
  ```

**2. Start the Frontend Application:**
- The frontend requires two separate terminal processes.
- **Terminal 1 (Renderer Process)**: Navigate to the `frontend` directory and run the Vite development server.
  ```bash
  # From /<project-root>/frontend/
  npm run dev
  ```
- **Terminal 2 (Main Process)**: In a new terminal, navigate to the `frontend` directory and run the Electron main process.
  ```bash
  # From /<project-root>/frontend/
  npm run electron
  ```

### Running Tests
These instructions assume you have already set up your environment and installed all dependencies.

#### Backend Tests (pytest)
1.  Ensure your `desktop-assistant-env` Conda environment is active.
2.  From the **project root directory**, run the test suite:
    ```bash
    pytest
    ```

#### Frontend Tests (Jest)
1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Run the tests:
    ```bash
    npm test
    ```

### Committing Code with Pre-Commit Hooks

The project uses `pre-commit` to enforce code standards automatically before each commit. This process can sometimes require a multi-step commit process. Follow these steps to ensure your commits are successful:

**Step 1: Make Your Initial Commit Attempt**
Run `git commit` with your message as you normally would. The pre-commit hooks will run automatically. It is common for this first attempt to fail, especially if the auto-formatters find issues.

**Step 2: Stage the Automatic Fixes**
If the commit fails, hooks like `black` or `isort` may have automatically fixed formatting issues. These changes will be unstaged. You must stage them before trying to commit again.
```bash
git add .
```

**Step 3: Re-run the Commit Command**
Attempt the **exact same `git commit` command again**. If the only issues were auto-formatable, this second attempt will succeed.

**Step 4: Handle Persistent `pylint` Errors (If Necessary)**
Sometimes, the commit may still fail due to `pylint` errors, particularly `import-error` messages. This is a known issue related to the pre-commit environment's path. If you have confirmed that your code works and all tests (`pytest`) pass, it is acceptable to bypass the hook for this commit.

**This should be used as a last resort only for these known, non-critical linting issues.**
```bash
git commit --no-verify -m "your commit message"
```

### Commit Message Content
- **Adhere to Conventional Commits**: Follow the format `type(scope): subject` as outlined in `CODE_STANDARDS.md`.
- **Avoid Special Characters**: When committing (especially when using an AI assistant's shell tool), do not use shell metacharacters like backticks (\`), dollar signs with parentheses (`$()`), or angle brackets (`<>`) in the commit message itself, as this can cause the shell command to be rejected for security reasons.

**Adding New Python Dependencies:**
- If you add a new Python library to `requirements.txt` that is used in the backend, you **must** also add it to the `additional_dependencies` list for the `pylint` hook in the `.pre-commit-config.yaml` file. Failure to do so will cause `pylint` to fail with an `import-error`.

### Git Workflow

- **Pull Before Pushing**: Always run `git pull` on a branch before you `git push` to ensure you have the latest changes and avoid merge conflicts.
- **Merge Strategy**: The repository is configured to prefer merging over rebasing when pulling divergent branches.

### AI Assistant Workflow Guidelines
- **Gain Context First**: Before starting any task, read all relevant documentation (like `README.md`, `CODE_STANDARDS.md`, and `PROJECT_CONTEXT.md`) and explore the codebase to understand the project's structure, conventions, and goals.
- **Read Before Modifying**: Always read the full content of a file before you attempt to modify it. This prevents mistakes and ensures your changes are consistent with the existing code.
- **Adhere to Standards**: All code modifications must strictly follow the standards and patterns defined in `CODE_STANDARDS.md` and observed in the surrounding codebase.

---

## Development Timeline

### Current Status
**Milestone 3 Complete**: Tool Integration has been successfully implemented. The agent now has practical capabilities beyond conversation - it can actually perform tasks on the user's computer through 8 built-in tools, automatic schema generation, and LLM-driven tool calling.

### Milestone Roadmap

**Milestone 1: Foundation** (Weeks 1-2)
- Issue #1: Project setup ✅
- Issue #2: Backend-frontend IPC ✅
- Issue #3: Basic UI ✅
- Issue #4: Configuration system ✅
- **Demo**: Type message, backend responds. Settings can be viewed and updated.

**Milestone 2: Core Agent** (Weeks 3-4)
- Issue #5: Multi-provider LLM client ✅
- Issue #6: Agent orchestrator ✅
- Issue #7: Thinking display ✅
- **Demo**: Intelligent multi-turn conversation with tool calling

**Milestone 3: Tool Integration** (Weeks 5-6) **✅ COMPLETED**
- Issue #11: Tool schema ✅ (Automatic schema generation implemented)
- Issue #12: Tool registry ✅ (8 tools registered)
- Issue #13: Tool executor ✅ (Tool orchestrator with error handling)
- Issue #14: Agent tool selection ✅ (LLM-driven tool calling)
- **Demo**: Agent uses tools for file operations, shell commands, and more
- **Files Added**: `schema_generator.py`, `tool_registry.py`, `filesystem/`, `shell.py`
- **Features**: Automatic schema generation from Python type hints, tool execution with safety, response parsing
- **Tools Implemented**: 7 filesystem tools + 1 shell tool with workspace validation and security

**Milestone 4: Memory** (Weeks 7-8) **🎯 NEXT**
- Issue #8: Passive memory storage
- Issue #9: Active memory monitoring
- Issue #10: Memory controls
- **Demo**: Agent recalls past conversations and activity

**Milestone 5: Advanced Tools** (Weeks 9-10)
- Issue #15: Terminal tool ✅ (Basic shell tool implemented)
- Issue #16: Confirmation system
- Issue #17: File operations tool ✅ (7 file tools implemented)
- Issue #18: Computer use tool
- **Demo**: Agent automates complex workflows

**Milestone 6: Voice** (Weeks 11-12)
- Issue #19: STT integration
- Issue #20: TTS integration
- Issue #21: Wake word detection
- Issue #22: Voice UI
- **Demo**: Hands-free voice conversation

**Milestone 7: Polish** (Weeks 13-14)
- Issue #23: Integration testing
- Issue #24: Error handling & logging
- Issue #25: Documentation
- Issue #26: Performance optimization
- Issue #27: Security hardening
- Issue #28: Installer
- **Demo**: Production-ready application

**Total MVP Timeline**: ~14 weeks (3.5 months)

---

## Key Technical Challenges & Solutions

### Challenge 1: Context Window Limits
**Problem**: LLMs have limited context windows (4K-128K tokens). Can't feed all memory.
**Solution**:
- Semantic search retrieves only relevant memories
- Intelligent pruning of conversation history
- Summarization of long conversations
- Hierarchical memory (summaries at different granularities)

### Challenge 2: Tool Selection Accuracy
**Problem**: Agent needs to choose correct tool from potentially hundreds.
**Solution**:
- Semantic search on tool descriptions
- Tool categorization and filtering
- Learning from successful/failed tool uses
- Clear, LLM-friendly tool descriptions
- Few-shot examples in system prompt

### Challenge 3: Active Memory Privacy
**Problem**: Monitoring user activity raises serious privacy concerns.
**Solution**:
- Opt-in, not default
- Local storage only
- App-level exclusions
- Clear visual indicators
- User-controlled retention
- Open source for auditability

### Challenge 4: Tool Execution Security
**Problem**: Tools execute arbitrary code, potential security risk.
**Solution**:
- Subprocess sandboxing
- Permission system (tools declare needs)
- Human verification for marketplace tools
- Timeouts and resource limits
- Comprehensive logging
- User confirmation for destructive ops

### Challenge 5: Voice Accuracy & Latency
**Problem**: STT must be accurate AND fast for natural conversation.
**Solution**:
- Multiple STT providers (user chooses)
- Local Whisper for privacy, cloud for accuracy
- Voice Activity Detection to reduce processing
- Streaming transcription where available
- Push-to-talk fallback

### Challenge 6: Memory System Performance
**Problem**: Semantic search on large memory datasets could be slow.
**Solution**:
- Efficient vector database (FAISS, ChromaDB)
- Incremental indexing
- Caching of frequent queries
- Async operations don't block UI
- Periodic memory optimization

---

## Success Metrics

### MVP Success Criteria
- Application installs on clean Windows 10/11
- Users can have text conversations with context recall
- Users can have voice conversations
- Agent successfully executes terminal commands
- Agent can control computer via CUA tool
- 3+ verified marketplace tools work
- Active memory monitoring functions
- No critical security vulnerabilities
- Complete documentation

### Post-MVP Metrics
- **User Retention**: % still using after 1 week, 1 month
- **Engagement**: Average daily usage time
- **Tool Ecosystem**: Number of community-contributed tools
- **Community Growth**: GitHub stars, forks, contributors
- **Performance**: Response time < 3 seconds for typical queries
- **Reliability**: Crash-free rate > 99%
- **Satisfaction**: User survey scores

---

## Future Roadmap (Beyond MVP)

### Phase 8: Advanced Memory
- Semantic memory (extracted facts)
- Procedural memory (learned workflows)
- Memory summarization and compression
- Cross-session learning and improvement

### Phase 9: Enhanced Capabilities
- Multi-modal inputs (images, documents, video)
- Code understanding and generation
- Database query tool
- Email and calendar integration
- Browser automation tool
- API integration framework

### Phase 10: Collaboration
- Multi-user support
- Shared memory spaces
- Team workflows
- Remote assistance capabilities

### Phase 11: Cross-Platform
- macOS support
- Linux support
- Mobile companion apps (iOS/Android)
- Optional cloud sync

### Phase 12: Enterprise
- Organization deployment tools
- Centralized management
- Compliance features
- SSO integration
- Custom tool repositories

---

## Use Cases & Examples

### Use Case 1: Elderly Computer Help
**Scenario**: Grandmother needs to attach a photo to an email.

**Without Desktop Assistant**:
- Struggles to find photo in file system
- Doesn't know how to resize if too large
- Confused by email attachment UI
- May give up or call grandchild for help

**With Desktop Assistant**:
- Says: "Hey Assistant, help me send the photo from my camera to my daughter"
- Agent: Finds photos, offers to resize, opens email, attaches photo, assists with sending
- Grandmother successfully sends email independently

### Use Case 2: Developer Workflow Automation
**Scenario**: Developer starting work on a project.

**Without Desktop Assistant**:
- Manually open VSCode
- Navigate to project folder
- Open terminal
- Run git pull
- Start dev server
- Open browser to localhost
- Check for TODOs in project management tool

**With Desktop Assistant**:
- Says: "Hey Assistant, start work on the API project"
- Agent remembers this workflow, executes all steps automatically
- Developer is ready to code in seconds

### Use Case 3: Non-Technical User Troubleshooting
**Scenario**: User's WiFi isn't working.

**Without Desktop Assistant**:
- Google the problem
- Try to follow technical instructions
- Get confused by command-line instructions
- Give up or call tech support

**With Desktop Assistant**:
- "Hey Assistant, my WiFi isn't working"
- Agent runs diagnostics
- Identifies the issue (network adapter disabled)
- Asks permission to fix
- Re-enables adapter
- Problem solved

### Use Case 4: Context Recall
**Scenario**: Developer returns to a project after a week away.

**Without Desktop Assistant**:
- Reads through code trying to remember what they were doing
- Checks commit history
- Looks through notes
- Takes 30+ minutes to get back into context

**With Desktop Assistant**:
- "What was I working on last week in this project?"
- Agent retrieves memory: "Last Friday you were implementing the authentication middleware. You had completed the JWT validation but were debugging the refresh token logic. You left off with a failing test in auth.test.js."
- Developer immediately knows where to continue

### Use Case 5: Research Assistance
**Scenario**: User researching a topic while reading documents.

**Without Desktop Assistant**:
- Copy text from document
- Open ChatGPT
- Paste text
- Ask question
- Switch back to document
- Repeat for each question

**With Desktop Assistant**:
- Reading document, highlights text
- "Explain this concept in simpler terms"
- Agent reads highlighted text (via screen capture or clipboard)
- Provides explanation
- Continues reading
- Natural flow, no context switching

---

## Privacy & Security Model

### Privacy Principles
1. **Local First**: All data stored on user's machine by default
2. **User Control**: User decides what to remember/forget
3. **Transparency**: User can see everything stored
4. **Minimal Collection**: Only collect what's necessary
5. **No Tracking**: No analytics or telemetry without explicit consent

### Security Measures
1. **Encrypted Credentials**: API keys encrypted at rest using Windows DPAPI
2. **Sandboxed Tools**: Community tools run in isolated subprocesses
3. **Permission System**: Tools declare permissions, user reviews
4. **Audit Logging**: All tool executions logged
5. **Code Review**: Marketplace tools reviewed before approval
6. **Regular Updates**: Security patches released promptly
7. **Open Source**: Code auditable by anyone

### Data Handling
- **Memory Data**: Stored in local SQLite + vector DB
- **API Keys**: Encrypted using OS-level credential manager
- **Conversation History**: Local only, never uploaded
- **Activity Monitoring**: Completely opt-in, user-controlled
- **Tool Outputs**: Stored locally in memory system
- **Voice Recordings**: Not saved unless user explicitly requests

---

## Technical Innovations

### 1. Memory Payload System
Unlike typical agent frameworks where tools return opaque results, our tools return structured "memory payloads" that tell the agent what to remember. This solves the problem of the agent not knowing what happened inside tool execution.

### 2. Unified Memory Architecture
Combining episodic (events), semantic (facts), and procedural (workflows) memory in a single system with semantic search enables truly context-aware assistance.

### 3. Activity Monitoring Integration
Optional real-time monitoring of user activity creates unprecedented context awareness, making the assistant feel like it's truly "with you" throughout your workday.

### 4. Tool Marketplace with Verification
Community-contributed tools with a verification process balances extensibility with security, similar to app stores but for AI capabilities.

### 5. Multi-Modal Control
Seamless switching between text and voice, with both push-to-talk and wake word options, adapts to different usage contexts.

---

## Conclusion

Desktop Assistant represents a fundamental shift in human-computer interaction. By combining persistent memory, agentic behavior, tool extensibility, and natural interfaces, it makes advanced computing accessible to everyone. The project is built on principles of privacy, security, open source collaboration, and user empowerment.

The phased development approach, research-first methodology, and strong focus on code quality position the project for long-term success and community growth. With an estimated 14-week timeline to MVP and clear roadmap beyond, Desktop Assistant has the potential to become the definitive personal computing assistant.

---

**This context document should provide comprehensive understanding of the Desktop Assistant project for any AI or human who needs to work with or understand the system.**

---

## Implementation Status Summary

### ✅ FULLY IMPLEMENTED
- **Core Agent**: Multi-turn conversations with tool calling capabilities
- **Multi-Provider LLM Support**: OpenAI, Anthropic, Google, OpenRouter, Mistral AI, local models (Ollama, LM Studio)
- **Tool System**: 8 built-in tools (7 filesystem + 1 shell) with automatic schema generation
- **Configuration Management**: Secure API key handling, provider-specific configs, service layer architecture
- **IPC Bridge**: Robust WebSocket communication between frontend and backend
- **Frontend UI**: React components for chat, settings, and thinking display
- **File Operations**: Complete suite of safe file manipulation tools
- **Shell Commands**: Secure command execution with workspace validation

### 🔄 PARTIALLY IMPLEMENTED
- **Tool Marketplace**: Basic registry and executor framework (needs community tools)

### ❌ NOT YET IMPLEMENTED
- **Memory System**: Passive conversation storage and active monitoring
- **Voice Interface**: STT, TTS, wake word detection
- **Computer Use Automation**: GUI control and screen interaction
- **Advanced Tools**: Web browsing, API integrations, computer vision

### 🎯 NEXT PRIORITY (Milestone 4)
**Memory System Implementation**: Enable the agent to recall past conversations and maintain context across sessions.

---

**Last Updated**: November 8, 2025

---

## Recent Updates (November 8, 2025)

### UI Message Type Separation
- **Visual Distinction**: The UI now displays three distinct message types with different styling:
  - **Tool Calls** (Green): Shows the JSON function call when the LLM requests a tool (e.g., `{"functionCall": {"name": "read_file", "args": {...}}}`)
  - **Tool Outputs** (Orange): Displays the actual result/content from tool execution (e.g., file contents, command output)
  - **LLM Text** (Gray): Normal conversational responses from the assistant
- **Backend Changes**: The orchestrator now sends separate `tool_call` and `tool_output` events to the frontend, allowing proper message type classification
- **Frontend Changes**: Updated `useStreamingMessages.js` to handle `tool-call` and `tool-output` message types, and `ChatInterface.jsx` to render them with distinct visual styles

### Response Parser Improvements
- **Stricter Fallback Parsing**: Enhanced the fallback parser (`_parse_function_calls`) to prevent false positive tool call detection from LLM explanatory text
- **Blacklist Filtering**: Added comprehensive blacklist of common words that appear in explanations (e.g., "providers", "modes", "get_model_id") to prevent them from being parsed as tool calls
- **Validation Rules**: Tool calls must now have `key=value` parameter format and produce actual parsed parameters to be considered valid

### Service Layer Architecture
- **AppServices Container**: Created a service container class that wraps configuration and provides access to application services
- **WorkspaceContext**: Handles workspace path validation with `is_path_within_workspace()` method
- **FileService**: Provides file filtering logic for common patterns (`.git`, `__pycache__`, etc.)
- **StorageService**: Manages temporary directories and storage operations
- **Tool Integration**: Tools now receive `AppServices` instances instead of raw config for clean separation of concerns

---
**Current Milestone**: 3/7 completed (43% complete)
**Architecture**: Stable and well-tested foundation ready for memory system development

---

## Testing Strategy (Excruciating Detail)
The project maintains a rigorous testing strategy to ensure code quality, prevent regressions, and validate functionality. The tests are located in the top-level `tests/` directory, mirroring the structure of the main `backend/` and `frontend/` source directories.

**Backend Testing (`tests/backend/`)**
- **Framework**: `pytest` is used as the primary testing framework for its powerful features, fixture support, and plugin ecosystem. `pytest-asyncio` is used to test the extensive `async` code.
- **Unit Tests**: Each module and class generally has a corresponding test file (e.g., `backend/agent/orchestrator.py` is tested by `tests/backend/agent/test_orchestrator.py`).
- **Mocking**: The `unittest.mock` library (especially `MagicMock` and `AsyncMock`) is used extensively to isolate components during unit testing. For example, when testing the `Agent Orchestrator`, the `LLMClient` is mocked to return predefined responses, allowing tests to focus solely on the orchestrator's logic without making actual API calls.
- **Tool Testing**: Each built-in tool has a dedicated test file (e.g., `test_file_system_tools.py`). These tests cover:
  - **Success Cases**: Validating that the tool works as expected with correct inputs.
  - **Error Cases**: Ensuring the tool fails gracefully and returns informative error messages for invalid inputs (e.g., non-existent files, paths outside the workspace).
  - **Edge Cases**: Testing for specific scenarios like empty files, large files (for truncation), or commands with no output.
- **Configuration Testing**: `test_config.py` validates that the configuration loads correctly, falls back to defaults, and handles API key loading as expected.
- **End-to-End (Integration) Style Tests**: While not true end-to-end tests, some tests cover the integration between multiple components. For example, `test_server.py` simulates a WebSocket client connecting to the server and sending messages, testing the entire backend stack from the server entry point down to the agent and tools.

**Frontend Testing (`tests/frontend/`)**
- **Framework**: `Jest` is used as the test runner, and `React Testing Library` is used for rendering and interacting with React components.
- **Component Tests**: Each major React component has a corresponding `.spec.jsx` file (e.g., `ChatInterface.spec.jsx`).
- **User Interaction Simulation**: Tests use `@testing-library/user-event` to simulate real user actions like typing in an input field and clicking buttons.
- **Snapshot Testing**: While used sparingly, some tests may use snapshot testing to detect unintentional UI changes.
- **Mocking**: The `jest.mock` function is used to mock dependencies, such as the `window.ipc` object, to isolate components from the Electron environment and simulate messages from the backend.

---
## Detailed End-to-End Workflows

### End-to-End Query Lifecycle (Excruciating Detail)
This workflow details the entire journey of a user message, from a key press in the UI to the final streamed response appearing on the screen.

**1. Frontend (Renderer): User Input**
   - The user types a message into the `<input>` field in `ChatInterface.jsx` and clicks "Send".
   - The `handleSubmit` function calls `handleSendMessage` in `App.jsx`.

**2. Frontend (Renderer): State Update & IPC Send**
   - `handleSendMessage` in `App.jsx` immediately updates the local React state:
     - The user's message is added to the `messages` array, causing the UI to re-render and show the new message.
     - `isSending` is set to `true`, disabling the input field.
   - It then sends the message to the Electron main process: `window.ipc.send('to-backend', { type: 'query', ... })`.

**3. Frontend (Main): IPC Bridge to WebSocket**
   - In `ipc.cjs`, the `ipcMain.on('to-backend', ...)` listener receives the message.
   - It wraps the message in the standard IPC format (adding a UUID and timestamp) and sends it over the active WebSocket connection to the Python backend.

**4. Backend: WebSocket Server Receives Message**
   - The `handler` function in `server.py` is constantly listening for messages on the WebSocket.
   - The message is received, parsed from JSON, and passed to the `_handle_message` router.

**5. Backend: Routing and Agent Invocation**
   - `_handle_message` sees the `type: "query"` and calls `_handle_query`.
   - `_handle_query` extracts the query text and calls the main `agent.process_query(query_text)` method.

**6. Backend: Agent Processing (The Loop)**
   - `agent.process_query` executes its full tool-calling loop (as documented in "Agent Orchestrator Logic").
   - As the agent processes, it `yield`s a stream of dictionary events, such as:
     - `{'type': 'thinking', 'content': 'Executing tool...'}`
     - `{'type': 'chunk', 'content': 'Hello, this is part of the response.'}`
     - `{'type': 'tool_execution', ...}`

**7. Backend: Streaming Responses back via WebSocket**
   - Back in `server.py`, the `stream_query_with_timeout` function iterates through the events yielded by the agent.
   - For each event, it constructs a JSON response message (e.g., `{ "type": "llm-thought", ... }` or `{ "type": "streaming-response", ... }`) and sends it back to the frontend over the WebSocket.

**8. Frontend (Main): WebSocket to IPC Bridge**
   - The `ws.on('message', ...)` listener in `ipc.cjs` receives the streamed events from the backend.
   - It immediately forwards each event to the renderer process: `mainWindow.webContents.send('from-backend', data)`.

**9. Frontend (Renderer): IPC to State Update**
   - The `window.ipc.on('from-backend', ...)` listener in `useMessageHandling.js` receives the events.
   - It calls the appropriate handler from the specialized hooks:
     - A `streaming-response` event calls `handleStreamingResponse` in `useStreamingMessages.js`. This function finds the last (incomplete) assistant message in the `messages` state and appends the new text chunk, triggering a re-render.
     - An `llm-thought` event calls `handleLlmThought`, which updates the `thinkingStatus` state, causing the `ThinkingDisplay` component to show the agent's current action.

**10. Frontend (Renderer): Finalizing the Stream**
    - When the backend sends the `streaming-complete` message, `handleStreamingComplete` is called.
    - This sets `isSending` to `false` (re-enabling the input field) and clears the `thinkingStatus`. The user can now send another message.

### Dynamic Model Switching Lifecycle (Excruciating Detail)
This workflow details the sequence of events when a user changes the active LLM in the settings panel.

**1. Frontend: User Selection**
   - The user selects a new model from the dropdown in the `SettingsPanel.jsx` component.
   - The component's `onChange` handler calls the `handleConfigChange` function, which was passed down from `App.jsx`.

**2. Frontend: Optimistic Update & IPC Send**
   - `handleConfigChange` in `App.jsx` immediately performs an **optimistic update**:
     - It updates the local `config` state with the new model information. The UI re-renders instantly to reflect the change.
     - It sets the `saveStatus` state to `"saving"`, which can be used to show a saving indicator in the UI.
     - It starts a 10-second `setTimeout` as a safety net. If no confirmation is received from the backend within 10 seconds, it will automatically set the `saveStatus` to `"error"` and revert the UI to the previous state.
   - It then sends the updated configuration object to the backend: `window.ipc.send('to-backend', { type: 'update-settings', ... })`.

**3. Backend: IPC to Settings Handler**
   - The `_handle_message` router in `server.py` receives the message and calls `_handle_update_settings`.

**4. Backend: Validation, Persistence, and Agent Update**
   - `_handle_update_settings` performs several critical actions inside a lock to prevent race conditions:
     - **Validation**: It merges the received settings with the existing ones and validates the complete object against the `AppConfig` Pydantic model. If validation fails, it sends an `error` message back and stops.
     - **API Key Reload**: It calls `load_api_key_for_provider` to load the new API key (if any) from the environment variables.
     - **Persistence**: It saves the new, validated configuration to the `config.yaml` file on disk (excluding the raw API key).
     - **Agent Hot-Swap**: It calls `agent.update_config(new_config)`.
     - Inside the `Agent` class, the `update_config` method replaces the agent's internal config and, most importantly, creates a **new instance** of the `LiteLLMClient` with the updated settings: `self.llm_client = get_llm_client(self.cfg)`. The agent is now ready to use the new model for the next query.
     - **Reload Global Settings**: It calls `reload_settings()` to ensure the global singleton is updated.

**5. Backend: Confirmation Message**
   - After successfully completing all steps, the backend sends a `settings-updated` confirmation message back to the frontend.

**6. Frontend: Handling Confirmation**
   - The `useMessageHandling.js` hook receives the confirmation.
   - It calls `handleSettingsUpdated` from `useSettingsManagement.js`.
   - This handler clears the 10-second safety timeout and sets the `saveStatus` to `"success"`, typically displaying a "Saved!" message for a few seconds before returning to idle.

This robust, optimistic-update-with-fallback process provides a snappy user experience while ensuring that the frontend and backend states remain synchronized and the agent is always using the correct, validated configuration.

#### Testing Strategy (Excruciating Detail)
The project maintains a rigorous testing strategy to ensure code quality, prevent regressions, and validate functionality. The tests are located in the top-level `tests/` directory, mirroring the structure of the main `backend/` and `frontend/` source directories.

**Backend Testing (`tests/backend/`)**
// ... existing code ...
