# Tool Development Guide

This guide explains how to create tools for the Personal Assistant system using the SDK. Tools are the primary way the assistant can interact with external systems and perform tasks.

## Tool Architecture

Tools in the Personal Assistant system are built using a modern SDK that provides:

- **Type Safety**: Pydantic models for argument validation
- **Async Execution**: All tools run asynchronously
- **Context Awareness**: Access to user, session, and runtime services
- **Standardized Interface**: Consistent execution and error handling
- **Automatic Schema Generation**: LLM can understand tool capabilities
- **Agent SDK**: Specialized agents for complex multi-step tasks with sub-conversations

## Basic Tool Structure

Every tool inherits from `Tool[TArgs]` where `TArgs` is a Pydantic model defining the tool's arguments.

```python
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext

class MyToolArgs(BaseModel):
    """Arguments for my tool."""
    input_text: str = Field(..., description="The text to process")
    max_length: int = Field(default=100, description="Maximum output length")

class MyTool(Tool[MyToolArgs]):
    """My custom tool."""
    name = "my_tool"
    description = "A tool that processes text in some way"
    args_model = MyToolArgs

    async def run(self, args: MyToolArgs, ctx: ToolContext) -> Dict[str, Any]:
        """Execute the tool."""
        # Tool logic here
        result = process_text(args.input_text, args.max_length)

        return {
            "success": True,
            "data": {"processed_text": result},
            "llm_content": result,
            "return_display": result,
        }
```

## Agent Development

Agents are specialized tools that create sub-conversations to handle complex, multi-step tasks. An Agent IS-A Tool, meaning it can be registered and called just like any other tool, but internally it spins up a separate agent session with its own conversation loop.

### Basic Agent Structure

```python
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from backend.src.sdk.agents.base import Agent
from backend.src.sdk.context import ToolContext

class BlogWriterArgs(BaseModel):
    """Arguments for blog writing agent."""
    topic: str = Field(..., description="The topic to write about")
    word_count: int = Field(default=800, description="Target word count")
    style: str = Field(default="professional", description="Writing style")

class BlogWriterAgent(Agent[BlogWriterArgs]):
    """Agent that writes blog posts."""

    name = "blog_writer_agent"
    description = "Writes comprehensive blog posts on given topics"
    args_model = BlogWriterArgs

    # Agent-specific configuration
    system_prompt = """You are a professional blog writer. You have access to research tools,
    writing assistants, and can break down complex topics into engaging articles."""

    allowed_tools = [
        "web_search",
        "read_file",
        "write_file",
        "text_analyzer",
        "content_planner"
    ]

    def get_task_from_args(self, args: BlogWriterArgs) -> str:
        """Convert arguments to a task description for the agent."""
        return f"""Write a {args.word_count}-word blog post about "{args.topic}"
        in a {args.style} style. Research the topic thoroughly, create an outline,
        and write an engaging article with proper structure, headings, and formatting."""
```

### How Agents Work

When an Agent tool is executed:

1. **Session Creation**: A new sub-session is created with the agent's system prompt
2. **Tool Access**: The sub-agent has access only to the specified `allowed_tools`
3. **Task Execution**: The agent processes the task through its conversation loop
4. **Result Collection**: The final response from the agent's last message is returned

### Agent Configuration

#### System Prompt
The `system_prompt` defines the agent's personality and capabilities:

```python
system_prompt = """You are an expert data analyst. You excel at:
- Analyzing complex datasets
- Creating insightful visualizations
- Drawing meaningful conclusions
- Explaining technical concepts clearly"""
```

#### Allowed Tools
The `allowed_tools` list specifies which tools the agent can use:

```python
allowed_tools = [
    "data_analyzer",
    "chart_generator",
    "file_reader",
    "calculator",
    "report_writer"
]
```

### Advanced Agent Patterns

#### Research Agent
```python
class ResearchAgent(Agent[ResearchArgs]):
    """Agent specialized in research tasks."""

    system_prompt = "You are a research specialist who thoroughly investigates topics..."
    allowed_tools = ["web_search", "academic_search", "data_extractor", "note_taker"]

    def get_task_from_args(self, args: ResearchArgs) -> str:
        return f"Research the topic '{args.topic}' and provide a comprehensive summary..."
```

#### Multi-Step Workflow Agent
```python
class ProjectManagerAgent(Agent[ProjectArgs]):
    """Agent that manages complex projects."""

    system_prompt = "You are a project manager who breaks down complex tasks..."
    allowed_tools = ["task_planner", "resource_allocator", "progress_tracker", "team_communicator"]

    def get_task_from_args(self, args: ProjectArgs) -> str:
        return f"""Manage the project: {args.project_name}
        Goals: {args.goals}
        Deadline: {args.deadline}
        Resources: {args.resources}"""
```

### Agent Context and Services

Agents have access to the same context as regular tools, plus additional agent-specific services:

```python
async def run(self, args: MyArgs, ctx: ToolContext) -> Dict[str, Any]:
    # Access to parent session
    parent_session = ctx.services.get("session")

    # Agent factory for creating sub-agents if needed
    if ctx.agents:
        # Create a helper agent for a sub-task
        helper = ctx.agents.create_agent(
            name="helper_agent",
            system_prompt="You are a helpful assistant.",
            parent_session=parent_session,
            tools=["basic_tools"]
        )

    # Regular tool execution continues...
```

### Best Practices for Agents

1. **Clear System Prompts**: Define the agent's role, expertise, and working style clearly
2. **Appropriate Tool Sets**: Only include tools the agent actually needs
3. **Task Decomposition**: Design agents that break complex tasks into manageable steps
4. **Error Handling**: Agents should handle errors gracefully and provide meaningful feedback
5. **Resource Limits**: Consider tool execution limits and conversation length

### Agent vs Tool Decision

Use an **Agent** when:
- The task requires multiple steps or decision points
- The task benefits from conversation history and context
- You need specialized expertise or working style
- The task involves research, analysis, or creative work

Use a regular **Tool** when:
- The task is straightforward and can be completed in a single operation
- The task doesn't require conversation history
- Speed and efficiency are more important than flexibility

## Tool Arguments (Pydantic Models)

Arguments are defined using Pydantic models with proper field descriptions:

```python
from pydantic import BaseModel, Field
from typing import Optional, List

class FileOperationArgs(BaseModel):
    """Arguments for file operations."""
    path: str = Field(..., description="Path to the file")
    content: Optional[str] = Field(None, description="Content to write (for write operations)")
    encoding: str = Field(default="utf-8", description="File encoding")
    create_dirs: bool = Field(default=False, description="Create parent directories if they don't exist")

class SearchArgs(BaseModel):
    """Arguments for search operations."""
    query: str = Field(..., description="Search query")
    file_types: List[str] = Field(default_factory=list, description="File extensions to search in")
    case_sensitive: bool = Field(default=False, description="Case sensitive search")
```

## Execution Context

Every tool receives a `ToolContext` object providing access to:

### Identity Information
```python
# User information
ctx.user.user_id: str
ctx.user.username: Optional[str]
ctx.user.permissions: List[str]

# Session information
ctx.session.session_id: str
ctx.session.created_at: float
ctx.session.metadata: Dict[str, Any]
```

### Runtime Capabilities
```python
# Workspace information
ctx.workspace_root: str

# Available services
ctx.services: Dict[str, Any]

# Agent factory (for creating sub-agents)
ctx.agents: Optional[AgentFactoryInterface]

# Create a sub-agent
if ctx.agents:
    agent = ctx.agents.create_agent(
        name="helper_agent",
        system_prompt="You are a helpful assistant.",
        parent_session=ctx.session,
        tools=["tool1", "tool2"]
    )
    result = await agent.process_query("Help me with this task")
```

## Return Values

Tools must return a dictionary with specific keys:

```python
return {
    "success": bool,           # Whether the operation succeeded
    "data": Dict[str, Any],    # Structured data result
    "llm_content": str,        # Content for the LLM (summary/result)
    "return_display": str,     # Content to display to user
    # Optional keys:
    "error": str,             # Error message if success=False
}
```

### Success Response
```python
async def run(self, args: MyArgs, ctx: ToolContext) -> Dict[str, Any]:
    try:
        result = await self.process_data(args.input_data)

        return {
            "success": True,
            "data": {
                "processed_data": result,
                "metadata": {"processing_time": time_taken}
            },
            "llm_content": f"Successfully processed data: {result.summary}",
            "return_display": f"Data processed successfully\n\nResult: {result.details}",
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Processing failed: {str(e)}",
            "llm_content": f"Error: Processing failed: {str(e)}",
            "return_display": f"❌ Processing failed: {str(e)}",
        }
```

## Error Handling

Always wrap tool execution in try-catch blocks and return proper error responses:

```python
async def run(self, args: MyArgs, ctx: ToolContext) -> Dict[str, Any]:
    try:
        # Validate inputs
        if not args.path:
            return {
                "success": False,
                "error": "Path cannot be empty",
                "llm_content": "Error: Path cannot be empty",
                "return_display": "❌ Path cannot be empty",
            }

        # Check permissions
        if "file_read" not in ctx.user.permissions:
            return {
                "success": False,
                "error": "Insufficient permissions to read files",
                "llm_content": "Error: Insufficient permissions",
                "return_display": "❌ Permission denied",
            }

        # Execute tool logic
        result = await self.read_file(args.path)

        return {
            "success": True,
            "data": result,
            "llm_content": f"File content: {result[:200]}...",
            "return_display": f"📄 File content:\n{result}",
        }

    except FileNotFoundError:
        return {
            "success": False,
            "error": f"File not found: {args.path}",
            "llm_content": f"Error: File not found: {args.path}",
            "return_display": f"❌ File not found: {args.path}",
        }
    except PermissionError:
        return {
            "success": False,
            "error": f"Permission denied: {args.path}",
            "llm_content": f"Error: Permission denied: {args.path}",
            "return_display": f"❌ Permission denied: {args.path}",
        }
    except Exception as e:
        logger.error(f"Unexpected error in {self.name}: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "llm_content": f"Error: Unexpected error occurred",
            "return_display": f"❌ Unexpected error: {str(e)}",
        }
```

## Tool Categories

Tools are organized into categories for better discoverability:

- **filesystem**: File and directory operations
- **system**: System information and control
- **network**: HTTP requests, API calls
- **utility**: Text processing, calculations
- **development**: Code analysis, debugging
- **productivity**: Task management, organization

## Marketplace Tools

Tools can be published to the marketplace for community use:

### Directory Structure
```
tools/verified/my_tool/
├── tool.py              # Main tool implementation
├── manifest.json        # Tool metadata
├── README.md           # Documentation
└── __init__.py         # Package initialization
```

### Manifest File
```json
{
  "name": "my_tool",
  "version": "1.0.0",
  "description": "A tool that does something useful",
  "author": "Your Name",
  "category": "utility",
  "tool_class": "MyTool",
  "permissions": ["file_read"],
  "is_destructive": false,
  "tags": ["utility", "text", "processing"],
  "homepage": "https://github.com/your-repo",
  "license": "MIT"
}
```

### README File
```markdown
# My Tool

A brief description of what your tool does and how to use it.

## Features

- Feature 1
- Feature 2
- Feature 3

## Usage

The tool will be automatically discovered by the assistant and can be used by mentioning its name or capabilities.

## Configuration

Any special configuration requirements or environment variables.

## Examples

Show example usage patterns and outputs.
```

## Built-in Tools

The system includes several built-in tools that you can reference for patterns:

- **File Operations**: Reading, writing, searching files
- **System Info**: Getting system information
- **Web Requests**: Making HTTP requests
- **Text Processing**: String manipulation and analysis
- **Computer Control**: Mouse, keyboard, screenshot operations

## Best Practices

### Design Principles
1. **Single Responsibility**: Each tool should do one thing well
2. **Idempotent Operations**: Tools should be safe to run multiple times
3. **Clear Naming**: Use descriptive names and descriptions
4. **Proper Validation**: Validate all inputs thoroughly
5. **Error Resilience**: Handle errors gracefully and informatively

### Performance
1. **Async Operations**: Use async/await for all I/O operations
2. **Resource Limits**: Respect timeouts and resource constraints
3. **Efficient Algorithms**: Optimize for common use cases
4. **Caching**: Cache expensive operations when appropriate

### Security
1. **Permission Checks**: Verify user permissions before operations
2. **Input Sanitization**: Clean and validate all user inputs
3. **Safe Operations**: Avoid destructive operations by default
4. **Audit Logging**: Log security-relevant operations

### User Experience
1. **Clear Messages**: Provide clear success and error messages
2. **Progress Updates**: Show progress for long-running operations
3. **Structured Output**: Return structured data for programmatic use
4. **Helpful Descriptions**: Write clear field descriptions for LLM understanding

## Testing Tools

Create comprehensive tests for your tools:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from my_tool import MyTool, MyToolArgs
from backend.src.sdk.context import ToolContext, UserContext, SessionContext, ExecutionRuntime

@pytest.mark.asyncio
async def test_my_tool_success():
    """Test successful tool execution."""
    tool = MyTool()
    args = MyToolArgs(input_text="test", max_length=50)

    # Mock context
    ctx = ToolContext(
        user=UserContext(user_id="test_user"),
        session=SessionContext(session_id="test_session", created_at=1234567890),
        runtime=ExecutionRuntime(workspace_root="/tmp")
    )

    result = await tool.run(args, ctx)

    assert result["success"] is True
    assert "processed_text" in result["data"]
    assert result["llm_content"] is not None
    assert result["return_display"] is not None

@pytest.mark.asyncio
async def test_my_tool_validation_error():
    """Test tool argument validation."""
    tool = MyTool()
    args = MyToolArgs(input_text="", max_length=50)  # Invalid empty input

    ctx = ToolContext(
        user=UserContext(user_id="test_user"),
        session=SessionContext(session_id="test_session", created_at=1234567890),
        runtime=ExecutionRuntime(workspace_root="/tmp")
    )

    result = await tool.run(args, ctx)

    assert result["success"] is False
    assert "error" in result
```

## Publishing to Marketplace

To publish your tool to the marketplace:

1. **Create Repository**: Set up a GitHub repository for your tool
2. **Add Manifest**: Include proper `manifest.json` with metadata
3. **Write Documentation**: Create comprehensive README.md
4. **Add Tests**: Include unit tests and integration tests
5. **Submit PR**: Submit a pull request to the marketplace repository

## Debugging Tools

When developing tools, use these debugging techniques:

### Logging
```python
import logging
logger = logging.getLogger(__name__)

async def run(self, args: MyArgs, ctx: ToolContext) -> Dict[str, Any]:
    logger.info(f"Starting tool execution with args: {args}")
    logger.debug(f"Context: user={ctx.user.user_id}, session={ctx.session.session_id}")

    # Tool logic...

    logger.info(f"Tool execution completed successfully")
    return result
```

### Schema Inspection
```python
# Get the JSON schema for your tool
schema = tool.get_json_schema()
print(json.dumps(schema, indent=2))
```

### Manual Testing
Test tools manually by registering them and calling through the agent:

```python
# In a test script
from backend.src.tools.registry import ToolRegistry
from my_tool import MyTool

registry = ToolRegistry(config)
registry.register_tool(MyTool())

# Test execution
result = await registry.execute_tool("my_tool", {"input_text": "test"})
```

## Common Patterns

### File Operations
```python
class FileReaderArgs(BaseModel):
    path: str = Field(..., description="Path to file to read")
    encoding: str = Field(default="utf-8", description="File encoding")

class FileReader(Tool[FileReaderArgs]):
    name = "file_reader"
    description = "Read content from a file"
    args_model = FileReaderArgs

    async def run(self, args: FileReaderArgs, ctx: Context) -> Dict[str, Any]:
        import aiofiles

        try:
            async with aiofiles.open(args.path, 'r', encoding=args.encoding) as f:
                content = await f.read()

            return {
                "success": True,
                "data": {"content": content, "path": args.path},
                "llm_content": f"File content ({len(content)} chars): {content[:500]}...",
                "return_display": f"📄 {args.path}:\n{content}",
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "llm_content": f"Error reading file: {e}",
                "return_display": f"❌ Error reading file: {e}",
            }
```

### API Calls
```python
import httpx

class WebRequestArgs(BaseModel):
    url: str = Field(..., description="URL to request")
    method: str = Field(default="GET", description="HTTP method")
    headers: Dict[str, str] = Field(default_factory=dict, description="Request headers")

class WebRequest(Tool[WebRequestArgs]):
    name = "web_request"
    description = "Make HTTP requests to web APIs"
    args_model = WebRequestArgs

    async def run(self, args: WebRequestArgs, ctx: Context) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            try:
                response = await client.request(
                    method=args.method,
                    url=args.url,
                    headers=args.headers
                )

                return {
                    "success": True,
                    "data": {
                        "status_code": response.status_code,
                        "headers": dict(response.headers),
                        "content": response.text,
                    },
                    "llm_content": f"HTTP {response.status_code}: {response.text[:500]}...",
                    "return_display": f"🌐 {args.method} {args.url}\nStatus: {response.status_code}\n\n{response.text}",
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e),
                    "llm_content": f"HTTP request failed: {e}",
                    "return_display": f"❌ HTTP request failed: {e}",
                }
```

### Data Processing
```python
import json

class JsonProcessorArgs(BaseModel):
    json_data: str = Field(..., description="JSON string to process")
    operation: str = Field(..., description="Operation: 'parse', 'format', 'validate'")

class JsonProcessor(Tool[JsonProcessorArgs]):
    name = "json_processor"
    description = "Process JSON data"
    args_model = JsonProcessorArgs

    async def run(self, args: JsonProcessorArgs, ctx: Context) -> Dict[str, Any]:
        try:
            if args.operation == "parse":
                parsed = json.loads(args.json_data)
                return {
                    "success": True,
                    "data": {"parsed": parsed},
                    "llm_content": f"Parsed JSON with {len(parsed)} top-level keys",
                    "return_display": f"✅ JSON parsed successfully\nKeys: {list(parsed.keys())}",
                }
            elif args.operation == "format":
                parsed = json.loads(args.json_data)
                formatted = json.dumps(parsed, indent=2)
                return {
                    "success": True,
                    "data": {"formatted": formatted},
                    "llm_content": f"Formatted JSON ({len(formatted)} chars)",
                    "return_display": f"📄 Formatted JSON:\n{formatted}",
                }
            else:
                return {
                    "success": False,
                    "error": f"Unknown operation: {args.operation}",
                    "llm_content": f"Error: Unknown operation {args.operation}",
                    "return_display": f"❌ Unknown operation: {args.operation}",
                }
        except json.JSONDecodeError as e:
            return {
                "success": False,
                "error": f"Invalid JSON: {e}",
                "llm_content": f"JSON parsing error: {e}",
                "return_display": f"❌ Invalid JSON: {e}",
            }
```

## Agent Development

Agents are specialized tools that create sub-conversations to execute complex, multi-step tasks. Unlike regular tools that perform a single operation, agents can use multiple tools in sequence and maintain context across interactions.

### Creating Custom Agents

Agents inherit from the `Agent` base class, which provides the infrastructure for managing sub-sessions and tool orchestration.

```python
from typing import List
from pydantic import BaseModel, Field
from backend.src.sdk.agents.base import Agent
from backend.src.sdk.context import ToolContext

class BlogWriterArgs(BaseModel):
    """Arguments for blog writing agent."""
    topic: str = Field(..., description="The topic to write about")
    target_audience: str = Field(default="general", description="Target audience for the blog post")
    word_count: int = Field(default=800, description="Approximate word count")

class BlogWriterAgent(Agent[BlogWriterArgs]):
    """An agent that writes comprehensive blog posts."""

    name = "blog_writer"
    description = "Write comprehensive blog posts on given topics"
    args_model = BlogWriterArgs

    # Required agent configuration
    system_prompt = """
    You are an expert blog writer. Your task is to create engaging, well-researched blog posts.
    Use available tools to research the topic, gather information, and write comprehensive content.
    Structure your posts with:
    - Compelling introduction
    - Well-organized sections with headings
    - Practical examples and insights
    - Strong conclusion with actionable takeaways
    """

    # Specify which tools this agent can use in its sub-session
    allowed_tools: List[str] = [
        "web_search",      # For research
        "read_file",       # For reading existing content
        "write_file",      # For saving drafts
        "run_shell_command" # For running formatters, etc.
    ]

    # Optional: customize how arguments are converted to task description
    def get_task_from_args(self, args: BlogWriterArgs) -> str:
        """Convert arguments to a task description for the agent."""
        return f"""Write a {args.word_count}-word blog post about "{args.topic}"
        for a {args.target_audience} audience. Research thoroughly, create an outline,
        and write an engaging article with proper structure and formatting."""
```

### Agent System Prompt

The system prompt defines the agent's behavior, expertise, and working style:

```python
system_prompt = """
You are a specialized [AGENT_TYPE] agent.

Your expertise includes:
- [List key capabilities]
- [Define working methodology]
- [Specify output format preferences]

Always:
- Break complex tasks into manageable steps
- Use available tools efficiently
- Provide clear progress updates
- Ask for clarification when needed
- Maintain context across the conversation
"""
```

### Tool Selection for Agents

Choose tools that complement the agent's capabilities:

```python
# Research-focused agent
allowed_tools = [
    "web_search",
    "read_file",
    "search_replace",
    "run_shell_command"
]

# Data analysis agent
allowed_tools = [
    "read_file",
    "run_shell_command",  # For running scripts
    "write_file",         # For saving results
    "search_file_content" # For data exploration
]

# Content creation agent
allowed_tools = [
    "web_search",      # Research
    "read_file",       # Reference materials
    "write_file",      # Content creation
    "run_shell_command" # Formatting, validation
]
```

### Agent Execution Flow

When called, agents follow this execution pattern:

1. **Task Extraction**: Parse the user's request from arguments
2. **Sub-session Creation**: Create an isolated conversation session
3. **Tool Orchestration**: Use available tools to accomplish the task
4. **Response Generation**: Provide the final result to the parent session

### Advanced Agent Patterns

#### Sequential Task Agents

Agents that break work into clear phases:

```python
class ResearchPaperAgent(Agent[ResearchArgs]):
    """Agent that writes research papers."""

    system_prompt = """
    You are a research paper writing specialist. Follow this process:

    Phase 1: Research and Literature Review
    - Search for relevant papers and studies
    - Identify key findings and methodologies
    - Note contradictory evidence

    Phase 2: Outline Development
    - Create detailed paper structure
    - Define research questions and hypotheses
    - Plan evidence presentation

    Phase 3: Content Writing
    - Write introduction and background
    - Present methodology and results
    - Discuss implications and conclusions

    Phase 4: Review and Editing
    - Check for logical flow
    - Verify citations and references
    - Polish language and clarity
    """

    allowed_tools = [
        "web_search",
        "read_file",
        "write_file",
        "run_shell_command"
    ]
```

#### Collaborative Agents

Agents that work together by calling other agents:

```python
class ProjectManagerAgent(Agent[ProjectArgs]):
    """Agent that manages complex projects by coordinating other agents."""

    system_prompt = """
    You are a project manager agent. Break down complex projects into tasks
    and delegate to specialized agents. Coordinate their outputs and ensure
    project completion.
    """

    allowed_tools = [
        "blog_writer_agent",    # For documentation
        "code_reviewer_agent",  # For code review
        "testing_agent",        # For quality assurance
        "deployment_agent"      # For deployment tasks
    ]
```

### Agent Context and State

Agents maintain their own conversation history and can access:

- **Parent Session Context**: Information from the calling session
- **Tool Results**: Outputs from previously used tools
- **Intermediate Results**: Work-in-progress from multi-step tasks
- **User Preferences**: Settings and preferences from the parent context

### Best Practices for Agent Development

#### Prompt Engineering

1. **Be Specific**: Clearly define the agent's role and expertise
2. **Provide Structure**: Give clear workflows and output formats
3. **Set Boundaries**: Define what the agent should and shouldn't do
4. **Include Examples**: Show expected input/output patterns

#### Tool Selection

1. **Minimum Necessary**: Include only tools needed for the agent's tasks
2. **Complementary Tools**: Choose tools that work well together
3. **Safety First**: Avoid dangerous tools unless specifically needed
4. **Testing Coverage**: Ensure all allowed tools are tested with the agent

#### Error Handling

```python
class RobustAgent(Agent[TaskArgs]):
    """Agent with comprehensive error handling."""

    system_prompt = """
    You are a robust task executor. If you encounter issues:

    1. Try alternative approaches
    2. Ask for clarification when needed
    3. Provide clear error messages
    4. Suggest workarounds for common problems

    Never fail silently - always communicate issues and solutions.
    """

    allowed_tools = ["tool1", "tool2", "fallback_tool"]
```

### Testing Agents

Test agents like any other tool, but also test the conversation flow:

```python
import pytest
from unittest.mock import AsyncMock

class TestBlogWriterAgent:
    async def test_successful_blog_creation(self):
        """Test successful blog post creation."""
        agent = BlogWriterAgent()
        ctx = MockContext()

        args = BlogWriterArgs(
            topic="Python Async Programming",
            target_audience="developers",
            word_count=1000
        )

        result = await agent.run(args, ctx)

        assert result["success"] is True
        assert "Python Async Programming" in result["llm_content"]
        assert len(result["llm_content"]) > 500  # Reasonable length check

    async def test_agent_error_handling(self):
        """Test agent handles tool failures gracefully."""
        agent = BlogWriterAgent()
        ctx = MockContext()

        # Mock tool failure
        ctx.agents.create_agent = AsyncMock(side_effect=Exception("Tool failed"))

        args = BlogWriterArgs(topic="Test Topic")
        result = await agent.run(args, ctx)

        assert result["success"] is False
        assert "error" in result
```

### Agent Registration

Register agents just like regular tools:

```python
# In your tool package's __init__.py
from .blog_writer_agent import BlogWriterAgent

__all__ = ["BlogWriterAgent"]
```

Agents will be automatically discovered and made available to the LLM alongside regular tools.

### Performance Considerations

- **Tool Limits**: Don't give agents access to every tool - be selective
- **Session Timeouts**: Agents have the same timeout limits as regular tools
- **Resource Usage**: Monitor memory and API usage in agent sessions
- **Caching**: Leverage tool result caching for expensive operations

This guide covers the fundamentals of tool development. For more advanced patterns and examples, explore the built-in tools in the `backend/src/tools/` directory.
