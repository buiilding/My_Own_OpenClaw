"""
Frontend Tool Base Classes

Simplified tool classes for the frontend Python sidecar.
These are decoupled from the backend infrastructure.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Type, TypeVar, Generic, Optional
from pydantic import BaseModel

from core.system_state import get_system_state_xml

# Type variable for arguments
TArgs = TypeVar("TArgs", bound=BaseModel)


class FrontendTool(ABC, Generic[TArgs]):
    """
    Base class for all frontend tools.

    Frontend tools are simpler than backend tools - they don't need
    complex context objects or permission systems since they run
    locally with user permission.
    """

    # Must be defined by subclasses
    name: str
    description: str
    args_model: Type[TArgs]
    
    # Optional: Configure automatic image capture after tool execution
    # Set to "screenshot" to automatically capture screenshot after execution
    # Set to None (default) to disable automatic image capture
    # Future: Can be extended to "camera", "screen_recording", etc.
    auto_capture_image: Optional[str] = None

    @abstractmethod
    async def run(self, args: TArgs) -> Any:
        """
        Execute the tool with the given arguments.

        Args:
            args: Validated arguments from the pydantic model

        Returns:
            Tool result (must be JSON serializable)
        """
        pass

    def validate_args(self, args_dict: Dict[str, Any]) -> TArgs:
        """
        Validate and parse arguments using the pydantic model.

        Args:
            args_dict: Raw arguments dictionary

        Returns:
            Validated arguments object

        Raises:
            ValidationError: If arguments are invalid
        """
        return self.args_model(**args_dict)

    async def format_result(self, result: "SimpleToolResult", system_state_xml: Optional[str] = None) -> Dict[str, Any]:
        """
        Format the tool result into a structured string.
        Includes header, result data, system state, and status footer.
        """
        formatted_parts = [f"{self.name} output:"]
        
        if result.success:
            # Add main content
            content = result.data.get("llm_content") if isinstance(result.data, dict) else str(result.data)
            if not content:
                content = "Tool executed successfully"
            formatted_parts.append(content)
            
            # Add system state (REQUIRED - must be present)
            # This runs right after tool execution finishes, as fast as possible
            if system_state_xml:
                formatted_parts.append(system_state_xml)
            else:
                try:
                    system_state = await get_system_state_xml()
                    formatted_parts.append(system_state)
                except Exception as e:
                    logger.error(f"Failed to retrieve system state for tool output: {e}")
                    # Provide fallback system state - never skip it
                    from datetime import datetime
                    fallback_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    fallback_state = f""" <os_state>
    <active_window>Unknown</active_window>
    <mouse_position>Unknown</mouse_position>
    <time>{fallback_time}</time>
</os_state>"""
                    formatted_parts.append(fallback_state)
                    logger.warning("Using fallback system state for tool output")
            
            # Add screenshot indicator if present
            if isinstance(result.data, dict) and result.data.get("screenshot"):
                formatted_parts.append(f"State of the screen after {self.name} was executed:")
            
            formatted_parts.append("status: successful")
        else:
            formatted_parts.append(f"error: {result.error}")
            formatted_parts.append("status: failed")

        formatted_output = "\n".join(formatted_parts)
        
        # Construct the final result dict
        result_dict = result.to_dict()
        if "data" not in result_dict:
            result_dict["data"] = {}
        elif not isinstance(result_dict["data"], dict):
            result_dict["data"] = {"raw_result": result_dict["data"]}
            
        # Put the formatted string into llm_content for the backend to use
        result_dict["data"]["llm_content"] = formatted_output
        result_dict["data"]["is_preformatted"] = True
        
        return result_dict


class SimpleToolResult:
    """
    Simple result wrapper for tool execution.

    Provides a consistent format for tool results.
    """

    def __init__(self, success: bool, data: Any = None, error: str = None):
        self.success = success
        self.data = data
        self.error = error

    @property
    def message(self) -> str:
        """Get message from data if it's a string, otherwise return a default message."""
        if self.success and isinstance(self.data, str):
            return self.data
        return "Operation completed" if self.success else (self.error or "Operation failed")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        result = {"success": self.success}
        if self.success:
            if self.data is not None:
                result["data"] = self.data
        else:
            if self.error:
                result["error"] = self.error
        return result

    @classmethod
    def success(cls, data: Any = None) -> "SimpleToolResult":
        """Create a success result."""
        return cls(True, data)

    @classmethod
    def failure(cls, error: str) -> "SimpleToolResult":
        """Create a failure result."""
        return cls(False, error=error)