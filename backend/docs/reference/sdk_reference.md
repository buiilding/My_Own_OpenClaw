# SDK Reference Guide

This comprehensive guide provides detailed documentation for the Personal Assistant SDK, which enables developers to create tools, agents, and extensions for the system.

## Overview

The Personal Assistant SDK provides a clean, type-safe interface for extending the system's capabilities through:

- **Tool Development**: Create custom tools with automatic schema generation
- **Agent Creation**: Build specialized AI agents with custom behaviors
- **Context Management**: Access system resources and user context
- **Error Handling**: Standardized error handling and validation

## Core Components

### Tool SDK (`backend.src.sdk.tool`)

The Tool SDK provides the foundation for creating executable tools that can be invoked by the LLM.

#### Base Tool Class

```python
from typing import Dict, Any, Type
from pydantic import BaseModel
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class MyToolArgs(BaseModel):
    """Arguments for your tool."""
    input_text: str = Field(..., description="Text to process")
    max_length: int = Field(default=100, description="Maximum output length")

class MyTool(Tool[MyToolArgs]):
    """Your custom tool implementation."""

    # Required class attributes
    name = "my_tool"
    description = "A tool that processes text in some way"
    args_model = MyToolArgs

    async def run(self, args: MyToolArgs, ctx: Context) -> Dict[str, Any]:
        """Execute the tool logic."""
        # Your tool implementation here
        result = process_text(args.input_text, args.max_length)

        return {
            "success": True,
            "data": {"processed_text": result},
            "llm_content": result,  # What the LLM sees
            "return_display": result,  # What users see
        }
```

#### Tool Interface Methods

##### `run(args: TArgs, ctx: Context) -> Dict[str, Any]`

**Purpose**: Execute the tool's main logic.

**Parameters**:
- `args`: Validated arguments matching the `args_model`
- `ctx`: Execution context with system resources

**Returns**: Dictionary with standardized response format:
- `success` (bool): Whether the tool executed successfully
- `data` (dict): Structured tool-specific data
- `llm_content` (str): Content for LLM consumption
- `return_display` (str): User-friendly display content

**Required Response Fields**:
```python
{
    "success": bool,           # Execution status
    "data": Dict[str, Any],    # Tool-specific structured data
    "llm_content": str,        # Content passed to LLM
    "return_display": str,     # User-visible output
}
```

#### Tool Metadata

```python
class MyTool(Tool[MyToolArgs]):
    # Required metadata
    name = "unique_tool_name"                    # Unique identifier
    description = "Human-readable description"   # Tool purpose
    args_model = MyToolArgs                      # Pydantic argument model

    # Optional metadata
    version = "1.0.0"                           # Tool version
    author = "Your Name"                        # Tool author
    category = "utility"                        # Tool category
```

### Agent SDK (`backend.src.sdk.agents.base`)

The Agent SDK enables creation of specialized AI agents with custom behaviors and tool access.

#### Agent Class

The `Agent` class provides a clean API for creating sub-agents with custom personalities and tool restrictions.

```python
from backend.src.sdk.agents.base import Agent
from backend.src.agent.core import AgentSession

# Create an agent with custom configuration
agent = Agent(
    parent_session=parent_session,
    model_id="gemini-2.5-flash",
    system_prompt="You are a helpful assistant...",
    tools=["screenshot", "click_ocr_element"]
)

# Use the agent
response = await agent.respond(text="Open Chrome", image=screenshot_b64)
agent.clear_history()
```

#### Agent System Prompt

The `system_prompt` defines the agent's personality, capabilities, and behavior. This prompt is used when creating the sub-session for the agent:

```python
system_prompt = """
You are a specialized [ROLE] agent.

Your capabilities:
- [List key capabilities]
- [Define behavior patterns]
- [Specify output format]

Guidelines:
- [Behavioral rules]
- [Quality standards]
- [Interaction patterns]
"""
```

#### Agent Tool Access

Control which tools the agent can use in its sub-session:

```python
# No tool access (pure reasoning agent)
allowed_tools: List[str] = []

# Specific tools
allowed_tools: List[str] = ["web_search", "read_file", "run_terminal_cmd"]

# Note: The "*" wildcard is not currently supported
# All tools must be explicitly listed
```

#### Agent Execution Flow

When an Agent tool is executed:

1. **Validation**: Check if AgentFactory is available in context
2. **Session Creation**: Create a new sub-session with the agent's system prompt
3. **Tool Restriction**: Configure the sub-agent with only `allowed_tools`
4. **Task Extraction**: Convert tool arguments to a task description using `get_task_from_args()`
5. **Execution**: Run the task through the sub-agent's conversation loop
6. **Result Collection**: Gather the final response from the agent's history

### Context Management (`backend.src.sdk.context`)

The ToolContext object provides access to system resources, user information, and execution environment. It separates identity (who is performing the action) from capabilities (what can be done).

#### ToolContext Interface

```python
class ToolContext:
    """
    The container passed to `tool.run(args, ctx)`.

    It combines Identity (User/Session) with Runtime Capabilities.
    """

    # Identity
    user: UserContext
    session: SessionContext

    # Capabilities
    runtime: ExecutionRuntime

    # Convenience properties
    @property
    def workspace_root(self) -> str:
        return self.runtime.workspace_root

    @property
    def services(self) -> Dict[str, Any]:
        return self.runtime.services

    @property
    def agents(self) -> Optional[AgentFactoryInterface]:
        return self.runtime.agents
```

#### User Context

```python
@dataclass
class UserContext:
    """Identity: Who is performing the action?"""
    user_id: str
    username: Optional[str] = None
    permissions: list[str] = field(default_factory=list)
```

#### Session Context

```python
@dataclass
class SessionContext:
    """Identity: In what context is this happening?"""
    session_id: str
    created_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)
```

#### Execution Runtime

```python
@dataclass
class ExecutionRuntime:
    """
    Capabilities: What can the tool do?

    This object holds references to services and the environment.
    """
    workspace_root: str
    services: Dict[str, Any] = field(default_factory=dict)

    @property
    def agents(self) -> Optional[AgentFactoryInterface]:
        """Access the AgentFactory service."""
        return self.services.get("agent_factory")

    @property
    def file_service(self) -> Optional[Any]:
        """Access file system services."""
        return self.services.get("file_service")
```

#### Using ToolContext in Tools

```python
async def run(self, args: MyArgs, ctx: ToolContext) -> Dict[str, Any]:
    """Example tool using context."""

    # Access user identity
    user_id = ctx.user.user_id
    permissions = ctx.user.permissions

    # Access session information
    session_id = ctx.session.session_id

    # Access workspace
    workspace_path = ctx.workspace_root

    # Use services
    if ctx.runtime.file_service:
        file_service = ctx.runtime.file_service

    # Create sub-agents (if available)
    if ctx.agents:
        # Note: agents.create_agent returns an AgentSessionInterface, not awaitable
        agent_session = ctx.agents.create_agent("researcher_agent")
        # Process queries with the agent session
        async for response in agent_session.process_query("Research this topic"):
            # Handle streaming responses
            pass

    return {"success": True, "data": {...}}
```

### Error Handling (`backend.src.sdk.errors`)

Standardized error handling for SDK components.

#### SDK Exceptions

```python
from backend.src.sdk.errors import (
    SDKError,
    ToolExecutionError,
    ConfigurationError
)

class MyTool(Tool[MyArgs]):
    async def run(self, args: MyArgs, ctx: ToolContext) -> Dict[str, Any]:
        try:
            # Tool logic
            result = risky_operation(args.input)
            return {"success": True, "data": result}
        except ValueError as e:
            raise ToolExecutionError(f"Invalid input: {e}")
        except PermissionError as e:
            raise ToolExecutionError(f"Access denied: {e}")
        except Exception as e:
            raise ToolExecutionError(f"Tool execution failed: {e}", retryable=True)
```

#### Error Types

- **`SDKError`**: Base exception for all SDK errors
- **`ToolExecutionError`**: Raised when a tool fails to execute (includes `retryable` flag)
- **`ConfigurationError`**: Raised when a tool is misconfigured

## Tool Development Patterns

### Basic Tool Template

```python
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class ToolArgs(BaseModel):
    """Tool arguments with validation."""
    input_param: str = Field(..., description="Required input parameter")
    optional_param: Optional[str] = Field(None, description="Optional parameter")

class MyTool(Tool[ToolArgs]):
    """Tool implementation."""

    name = "my_tool"
    description = "What this tool does"
    args_model = ToolArgs

    async def run(self, args: ToolArgs, ctx: Context) -> Dict[str, Any]:
        """Main execution logic."""

        # Validate permissions
        if not self._check_permissions(ctx):
            raise PermissionError("Insufficient permissions")

        # Execute tool logic
        try:
            result = await self._execute_logic(args, ctx)

            return {
                "success": True,
                "data": result,
                "llm_content": self._format_for_llm(result),
                "return_display": self._format_for_user(result)
            }

        except Exception as e:
            ctx.logger.error(f"Tool execution failed: {e}")
            return {
                "success": False,
                "data": {"error": str(e)},
                "llm_content": f"Error: {e}",
                "return_display": f"❌ Tool failed: {e}"
            }

    def _check_permissions(self, ctx: Context) -> bool:
        """Check if user has required permissions."""
        return "required_permission" in ctx.user.permissions

    async def _execute_logic(self, args: ToolArgs, ctx: Context) -> Dict[str, Any]:
        """Core tool logic."""
        # Implementation here
        pass

    def _format_for_llm(self, result: Dict[str, Any]) -> str:
        """Format result for LLM consumption."""
        return f"Tool result: {result}"

    def _format_for_user(self, result: Dict[str, Any]) -> str:
        """Format result for user display."""
        return f"✅ Success: {result}"
```

### File Operation Tool

```python
from pathlib import Path
import aiofiles
from pydantic import BaseModel, Field

class ReadFileArgs(BaseModel):
    path: str = Field(..., description="Path to file to read")
    encoding: str = Field(default="utf-8", description="File encoding")

class ReadFileTool(Tool[ReadFileArgs]):
    name = "read_file"
    description = "Read content from a file"
    args_model = ReadFileArgs

    async def run(self, args: ReadFileArgs, ctx: Context) -> Dict[str, Any]:
        try:
            file_path = Path(ctx.workspace_root) / args.path

            # Security check
            if not self._is_safe_path(file_path, ctx.workspace_root):
                raise PermissionError("Access to file denied")

            async with aiofiles.open(file_path, 'r', encoding=args.encoding) as f:
                content = await f.read()

            return {
                "success": True,
                "data": {"content": content, "path": str(file_path)},
                "llm_content": f"File content:\n{content[:1000]}...",
                "return_display": f"📄 Read {len(content)} characters from {args.path}"
            }

        except FileNotFoundError:
            raise ValidationError(f"File not found: {args.path}")
        except Exception as e:
            raise ToolError(f"Failed to read file: {e}")

    def _is_safe_path(self, file_path: Path, workspace_root: str) -> bool:
        """Ensure file is within workspace and accessible."""
        try:
            file_path.resolve().relative_to(Path(workspace_root).resolve())
            return True
        except ValueError:
            return False
```

### Agent Creation Tool

```python
from pydantic import BaseModel, Field

class CreateAgentArgs(BaseModel):
    agent_type: str = Field(..., description="Type of agent to create")
    task_description: str = Field(..., description="Task for the agent")

class AgentOrchestratorTool(Tool[CreateAgentArgs]):
    name = "create_agent"
    description = "Create and execute a specialized agent"
    args_model = CreateAgentArgs

    async def run(self, args: CreateAgentArgs, ctx: Context) -> Dict[str, Any]:
        if not ctx.agents:
            raise ContextError("Agent factory not available")

        try:
            # Create the agent
            agent = await ctx.agents.create_agent(args.agent_type)

            # Prepare agent arguments
            agent_args = self._prepare_agent_args(args)

            # Execute agent
            result = await agent.run(agent_args, ctx)

            return {
                "success": True,
                "data": result,
                "llm_content": f"Agent {args.agent_type} completed: {result.get('summary', 'Task completed')}",
                "return_display": f"🤖 Agent {args.agent_type} finished successfully"
            }

        except Exception as e:
            raise AgentError(f"Agent execution failed: {e}")

    def _prepare_agent_args(self, args: CreateAgentArgs) -> BaseModel:
        """Convert tool args to agent-specific args."""
        # Implementation depends on agent requirements
        pass
```

## Agent Development Patterns

Note: Legacy `AgentTool` examples have been removed. Use the `Agent` class instead.

## Manifest System

Tools and agents require a manifest file for registration and metadata.

### Tool Manifest

```json
{
    "name": "my_tool",
    "version": "1.0.0",
    "description": "Human-readable description of the tool",
    "author": "Developer Name",
    "category": "utility",
    "tool_class_name": "MyTool",
    "permissions": ["file_read", "network_access"],
    "is_destructive": false,
    "tags": ["utility", "file-processing"]
}
```

### Manifest Fields

- **`name`** (string): Unique tool/agent identifier
- **`version`** (string): Semantic version number
- **`description`** (string): Human-readable description
- **`author`** (string): Tool developer name
- **`category`** (string): Functional category
- **`tool_class_name`** (string): Python class name
- **`permissions`** (array): Required system permissions
- **`is_destructive`** (boolean): Whether tool modifies system state
- **`tags`** (array): Additional categorization tags

## Testing SDK Components

### Tool Testing

```python
import pytest
from unittest.mock import MagicMock
from backend.src.sdk.context import ToolContext, UserContext, SessionContext, ExecutionRuntime

@pytest.mark.asyncio
async def test_my_tool():
    # Create mock context
    ctx = ToolContext(
        user=UserContext(user_id="test_user", permissions=["file_read"]),
        session=SessionContext(session_id="test_session", created_at=1234567890),
        runtime=ExecutionRuntime(
            workspace_root="/tmp/test",
            services={}
        )
    )

    # Create tool instance
    tool = MyTool()

    # Test successful execution
    args = MyToolArgs(input_text="test input")
    result = await tool.run(args, ctx)

    assert result["success"] is True
    assert "data" in result
    assert "llm_content" in result
    assert "return_display" in result

    # Test error handling
    with pytest.raises(ToolExecutionError):
        # Test with invalid input that causes an exception
        bad_args = MyToolArgs(input_text="")
        await tool.run(bad_args, ctx)
```

### Agent Testing

```python
@pytest.mark.asyncio
async def test_research_agent():
    # Create mock context with required services
    mock_agent_factory = MagicMock()
    mock_session = MagicMock()
    mock_agent_session = AsyncMock()
    mock_agent_factory.create_agent.return_value = mock_agent_session
    mock_agent_session.process_query = mock_async_generator([])
    mock_agent_session.history.get_history.return_value = [
        {"role": "assistant", "content": "Research completed successfully"}
    ]

    ctx = ToolContext(
        user=UserContext(user_id="test_user", permissions=["agent_create"]),
        session=SessionContext(session_id="test_session", created_at=1234567890),
        runtime=ExecutionRuntime(
            workspace_root="/tmp/test",
            services={
                "agent_factory": mock_agent_factory,
                "session": mock_session
            }
        )
    )

    agent = ResearcherAgent()
    args = ResearcherArgs(topic="Python async programming")

    result = await agent.run(args, ctx)

    assert result["success"] is True
    assert "llm_content" in result
    assert "return_display" in result
    # Verify agent factory was called with correct parameters
    mock_agent_factory.create_agent.assert_called_once()
    call_args = mock_agent_factory.create_agent.call_args
    assert call_args[1]["name"] == "researcher_agent"
    assert call_args[1]["system_prompt"] == agent.system_prompt
    assert call_args[1]["tools"] == agent.allowed_tools
```

## Best Practices

### Tool Development

1. **Type Safety**: Use Pydantic models for all arguments
2. **Error Handling**: Provide clear, actionable error messages
3. **Security**: Validate permissions and sanitize inputs
4. **Documentation**: Include comprehensive docstrings and examples
5. **Testing**: Write comprehensive unit and integration tests
6. **Performance**: Consider execution time and resource usage

### Agent Development

1. **Clear System Prompts**: Define behavior explicitly
2. **Appropriate Tool Access**: Grant minimum required permissions
3. **Output Consistency**: Maintain predictable output formats
4. **Error Recovery**: Handle tool failures gracefully
5. **Resource Awareness**: Be mindful of token limits and costs

### General SDK Usage

1. **Async First**: All operations should be asynchronous
2. **Context Awareness**: Use context appropriately for user/session data
3. **Logging**: Use provided logger for debugging and monitoring
4. **Validation**: Validate inputs and handle edge cases
5. **Backwards Compatibility**: Consider versioning and migration

## Security Considerations

### Permission Model

Tools and agents must declare required permissions:

```json
{
    "permissions": [
        "file_read",      // Read files from workspace
        "file_write",     // Write/modify files
        "network_access", // Make network requests
        "system_execute", // Execute system commands
        "agent_create"    // Create sub-agents
    ]
}
```

### Input Validation

Always validate and sanitize inputs:

```python
async def run(self, args: MyArgs, ctx: Context) -> Dict[str, Any]:
    # Path traversal protection
    if ".." in args.path or not args.path.startswith("/"):
        raise ValidationError("Invalid path")

    # Size limits
    if len(args.content) > MAX_SIZE:
        raise ValidationError("Content too large")

    # Content type validation
    if not self._is_valid_content(args.content):
        raise ValidationError("Invalid content type")
```

### Resource Limits

Implement resource controls:

```python
async def run(self, args: MyArgs, ctx: Context) -> Dict[str, Any]:
    # Time limits
    async with asyncio.timeout(TOOL_TIMEOUT):
        result = await self._execute(args)

    # Memory monitoring
    if self._memory_usage_exceeded():
        raise ToolError("Memory limit exceeded")

    return result
```

## Deployment and Distribution

### Tool Packaging

Tools should be packaged with:

```
my_tool/
├── manifest.json      # Tool metadata and permissions
├── tool.py           # Main tool implementation
├── requirements.txt   # Additional dependencies
├── README.md         # Documentation and examples
└── tests/            # Test suite
    └── test_tool.py
```

### Distribution

Tools can be distributed via:

1. **Local Installation**: Copy to `backend/tools/` directory
2. **Plugin Registry**: Submit to official plugin repository
3. **Community Marketplace**: Share via community channels

### Version Management

Follow semantic versioning:

- **MAJOR**: Breaking API changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible

## Troubleshooting

### Common Issues

#### Import Errors
```python
# Ensure proper Python path
import sys
sys.path.insert(0, '/path/to/backend')

from backend.src.sdk.tool import Tool
```

#### Permission Denied
- Check manifest permissions match actual requirements
- Verify user has necessary permissions in context
- Review security policy for tool execution

#### Schema Generation Issues
- Ensure Pydantic models are properly defined
- Check field descriptions are provided
- Validate model inheritance and imports

#### Context Access Problems
- Verify context is properly passed to tool/agent
- Check context attributes are available
- Review context initialization in test environments

### Debugging Tools

```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Inspect tool schema
tool = MyTool()
schema = tool.args_model.schema()
print(json.dumps(schema, indent=2))

# Test context creation
ctx = Context(
    user=UserContext(user_id="debug", permissions=["*"]),
    session=SessionContext(session_id="debug"),
    workspace_root="/tmp",
    services={},
    agents=None
)
```

## Future Extensions

### Planned SDK Features

- **Streaming Responses**: Real-time tool output streaming
- **Interactive Tools**: Tools that can request additional user input
- **Tool Chains**: Declarative tool composition and chaining
- **Custom Validators**: Domain-specific argument validation
- **Performance Monitoring**: Built-in metrics and profiling
- **Plugin Marketplace**: Integrated tool discovery and installation

This SDK reference provides the foundation for extending the Personal Assistant system. For specific examples and advanced patterns, refer to the verified tools in the `backend/tools/verified/` directory.
