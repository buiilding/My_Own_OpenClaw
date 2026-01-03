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
    """Result of a tool execution.
    
    This is the canonical format for tool results. Tools should return ToolResult
    directly instead of dictionaries to ensure type safety and avoid information loss.
    """
    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    llm_content: Optional[str] = None
    return_display: Optional[str] = None
    episodic_memories: Optional[List[Dict[str, Any]]] = None
    semantic_facts: Optional[List[str]] = None
    artifacts: Optional[Dict[str, Any]] = None
    
    @classmethod
    def from_dict(cls, result_dict: Dict[str, Any]) -> "ToolResult":
        """
        Convert dictionary to ToolResult (for backward compatibility with legacy tools).
        
        This is a single conversion point for tools that still return dicts.
        New tools should return ToolResult directly.
        
        Args:
            result_dict: Dictionary with tool result fields
            
        Returns:
            ToolResult instance
        """
        # Standard field names that map directly to ToolResult attributes
        standard_fields = {
            "success", "error", "data", "metadata", "llm_content", "return_display",
            "episodic_memories", "semantic_facts", "artifacts"
        }
        
        # Extract standard fields
        kwargs = {k: result_dict.get(k) for k in standard_fields if k in result_dict}
        
        # Determine success if not explicitly set
        if "success" not in kwargs:
            kwargs["success"] = "error" not in result_dict
        
        # Extract data field - if not present, use remaining non-standard fields
        if "data" not in kwargs or kwargs["data"] is None:
            data = {
                k: v for k, v in result_dict.items()
                if k not in standard_fields
            }
            kwargs["data"] = data if data else None
        
        # Auto-generate llm_content if missing
        if not kwargs.get("llm_content"):
            if kwargs.get("error"):
                kwargs["llm_content"] = f"Error: {kwargs['error']}"
            elif kwargs.get("data"):
                data = kwargs["data"]
                if isinstance(data, dict):
                    # Try common output fields, but exclude screenshot (handled separately in multimodal format)
                    # Screenshots should never be in text content - they're sent as image_url in multimodal messages
                    output_content = data.get("output") or data.get("message") or data.get("llm_content")
                    if output_content:
                        kwargs["llm_content"] = str(output_content)
                    elif "screenshot" not in data:
                        # Only use data dict if it doesn't contain screenshot
                        kwargs["llm_content"] = str(data)
                    else:
                        # If only screenshot is present, use a generic message
                        kwargs["llm_content"] = "Tool executed successfully"
                else:
                    kwargs["llm_content"] = str(data)
        
        # Auto-generate return_display if missing
        if not kwargs.get("return_display"):
            kwargs["return_display"] = kwargs.get("llm_content") or "Tool executed successfully"
        
        return cls(**kwargs)
    
    def format_for_history(
        self,
        tool_name: str,
        system_context: Optional[str] = None,
        screenshot_indicator: Optional[str] = None,
    ) -> str:
        """
        Format result for conversation history.
        
        Args:
            tool_name: Name of the tool that produced this result
            system_context: Optional system context XML (e.g., from system_monitor)
            screenshot_indicator: Optional screenshot indicator text
            
        Returns:
            Formatted message string for history
        """
        # If the result is already pre-formatted (e.g. by frontend), use it directly
        if self.metadata and self.metadata.get("is_preformatted") and self.llm_content:
            return self.llm_content

        parts = [f"{tool_name} output:"]
        
        if self.success:
            # Use llm_content or return_display, but never include screenshot data in text
            # Screenshots are handled separately via image_data parameter in add_tool_output()
            content = self.llm_content or self.return_display
            if not content and self.data:
                # If data is a dict, extract text fields but exclude screenshot
                if isinstance(self.data, dict):
                    # Try to get text content, excluding screenshot
                    content = (
                        self.data.get("output") or 
                        self.data.get("message") or 
                        self.data.get("llm_content") or
                        "Tool executed successfully"
                    )
                else:
                    content = str(self.data)
            if not content:
                content = "No output"
            parts.append(content)
            parts.append("status: successful")
        else:
            parts.append(f"error: {self.error}")
            parts.append("status: failed")
        
        if system_context:
            parts.append(system_context)
        
        if screenshot_indicator:
            parts.append(screenshot_indicator)
        
        return "\n".join(parts)

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

