"""
Base classes and utilities for tools.

This module provides the foundation for all tools in the assistant system,
including async support, error handling, and tool chaining capabilities.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

# Import schema generator for automatic schema generation
try:
    from backend.utils.schema_generator import generate_tool_schema
except ImportError:
    # Fallback if schema generator is not available
    generate_tool_schema = None

logger = logging.getLogger(__name__)


class Kind(Enum):
    """Enumeration of tool types for categorization and permissions."""

    READ = "read"
    EDIT = "edit"
    DELETE = "delete"
    MOVE = "move"
    SEARCH = "search"
    EXECUTE = "execute"
    THINK = "think"
    FETCH = "fetch"
    OTHER = "other"


# Function kinds that have side effects
MUTATOR_KINDS = {Kind.EDIT, Kind.DELETE, Kind.MOVE, Kind.EXECUTE}


@dataclass
class ToolResult:
    """Result of a tool execution."""

    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    # Content meant to be included in LLM history
    llm_content: Optional[str] = None

    # Markdown string for user display
    return_display: Optional[str] = None

    # Memory contributions from the tool (for marketplace tools)
    episodic_memories: Optional[List[Dict[str, Any]]] = None  # Detailed execution logs
    semantic_facts: Optional[List[str]] = None  # Extracted insights/learnings


@dataclass
class ToolContext:
    """Context information for tool execution."""

    parsed_response: Optional[Any] = None
    working_directory: Optional[str] = None
    environment: Optional[Dict[str, str]] = None
    timeout: Optional[float] = None
    user_permissions: Optional[List[str]] = None
    tool_registry: Optional[Any] = None  # For marketplace tools to access other tools


@dataclass
class ToolLocation:
    """Represents a file system location affected by a tool."""

    path: str
    line: Optional[int] = None


class Tool(ABC):
    """
    Abstract base class for all tools.

    Provides common functionality and ensures consistent interfaces
    across all tools in the system.
    """

    def __init__(self, name: str, description: str, kind: Kind = Kind.OTHER):
        """
        Initialize the tool.

        Args:
            name: Unique identifier for the tool
            description: Human-readable description of the tool's purpose
            kind: The type/category of the tool
        """
        self._name = name
        self._description = description
        self._kind = kind

    @property
    def name(self) -> str:
        """The unique name of the tool."""
        return self._name

    @property
    def description(self) -> str:
        """A description of what the tool does."""
        return self._description

    @property
    def kind(self) -> Kind:
        """The category/type of the tool."""
        return self._kind

    @abstractmethod
    async def execute_async(self, context: ToolContext, **kwargs) -> ToolResult:
        """
        Execute the tool asynchronously.

        Args:
            context: Execution context including working directory, environment, etc.
            **kwargs: Tool-specific parameters

        Returns:
            ToolResult containing the execution outcome
        """
        pass

    async def execute(self, **kwargs) -> Any:
        """
        Synchronous wrapper for execute_async.

        This method provides backward compatibility and simpler calling
        for tools that don't need complex context management.

        Args:
            **kwargs: Tool-specific parameters

        Returns:
            Tool execution result (data on success, raises exception on failure)
        """
        # Create default context
        context = ToolContext()

        result = await self.execute_async(context, **kwargs)

        if result.success:
            return result.data
        else:
            error_msg = result.error or "Tool execution failed"
            raise ToolExecutionError(error_msg, result.metadata)

    def validate_parameters(self, **kwargs) -> List[str]:
        """
        Validate tool parameters.

        Args:
            **kwargs: Parameters to validate

        Returns:
            List of validation error messages (empty list if valid)
        """
        return []

    def get_capabilities(self) -> Dict[str, Any]:
        """
        Get the tool's capabilities and requirements.

        Returns:
            Dictionary describing tool capabilities
        """
        return {
            "name": self.name,
            "description": self.description,
            "kind": self.kind.value,
            "parameters": {},
            "requires_context": False,
        }

    def get_schema(self) -> Dict[str, Any]:
        """
        Get the JSON schema for this tool's parameters.

        This method supports automatic schema generation from the execute_async
        method's signature and type hints. Subclasses can override this method
        to provide custom schemas if needed.

        Returns:
            JSON schema dictionary
        """
        # Try automatic schema generation first
        if generate_tool_schema is not None:
            try:
                # Use the execute_async method for schema generation
                if hasattr(self, "execute_async"):
                    return generate_tool_schema(
                        self.execute_async, self.name, self.description
                    )
            except Exception as e:
                logger.warning(
                    f"Failed to generate schema automatically for {self.name}: {e}"
                )

        # Fallback to empty schema
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {"type": "object", "properties": {}, "required": []},
        }


class ToolExecutionError(Exception):
    """Raised when a tool execution fails."""

    def __init__(self, message: str, metadata: Optional[Dict[str, Any]] = None):
        """
        Initialize the error.

        Args:
            message: Error message
            metadata: Additional error metadata
        """
        super().__init__(message)
        self.metadata = metadata or {}


# Utility functions for tool management
def create_tool_registry() -> Dict[str, Tool]:
    """
    Create a registry of all available tools.

    Returns:
        Dictionary mapping tool names to tool instances
    """
    # This will be populated when tools are created
    return {}
