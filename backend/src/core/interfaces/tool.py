"""
Tool Interface Definitions.

This module defines interfaces and data structures for tool execution results
and tool categorization. Used for backward compatibility with legacy tool system.
"""
from typing import Any, Dict, List, Protocol, runtime_checkable, Optional
from dataclasses import dataclass
from enum import Enum

class Kind(Enum):
    """Enumeration of tool types."""
    READ = "read"
    EDIT = "edit"
    DELETE = "delete"
    MOVE = "move"
    SEARCH = "search"
    EXECUTE = "execute"
    THINK = "think"
    FETCH = "fetch"
    OTHER = "other"

@dataclass
class ToolResult:
    """Result of a tool execution."""
    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    llm_content: Optional[str] = None
    return_display: Optional[str] = None
    episodic_memories: Optional[List[Dict[str, Any]]] = None
    semantic_facts: Optional[List[str]] = None
    artifacts: Optional[Dict[str, Any]] = None

@dataclass
class ToolContext:
    """Context information for tool execution."""
    parsed_response: Optional[Any] = None
    working_directory: Optional[str] = None
    environment: Optional[Dict[str, str]] = None
    timeout: Optional[float] = None
    user_permissions: Optional[List[str]] = None
    tool_registry: Optional[Any] = None

@runtime_checkable
class ToolInterface(Protocol):
    """Interface that all tools must implement."""
    
    @property
    def name(self) -> str:
        """The unique name of the tool."""
        ...

    @property
    def description(self) -> str:
        """A description of what the tool does."""
        ...

    @property
    def kind(self) -> Kind:
        """The category/type of the tool."""
        ...

    async def execute_async(self, context: ToolContext, **kwargs) -> ToolResult:
        """Execute the tool asynchronously."""
        ...

    def validate_parameters(self, **kwargs) -> List[str]:
        """Validate tool parameters."""
        ...

    def get_schema(self) -> Dict[str, Any]:
        """Get the JSON schema for this tool's parameters."""
        ...

    def get_capabilities(self) -> Dict[str, Any]:
        """Get the tool's capabilities and requirements."""
        ...

