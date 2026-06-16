"""Tool result data structures shared by backend tool execution paths."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


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
    output: Optional[str] = None
    episodic_memories: Optional[List[Dict[str, Any]]] = None
    semantic_facts: Optional[List[str]] = None
    artifacts: Optional[Dict[str, Any]] = None
    compaction_facts: Optional[Dict[str, Any]] = None

    @classmethod
    def from_payload(cls, result_payload: Dict[str, Any]) -> "ToolResult":
        """
        Normalize a tool result payload into a ToolResult.

        This is the canonical conversion point for SDK/local-runtime ingress
        payloads and backend tool implementations that return mapping-shaped
        data.

        Args:
            result_payload: Dictionary with tool result fields

        Returns:
            ToolResult instance
        """
        # Standard field names that map directly to ToolResult attributes
        standard_fields = {
            "success",
            "error",
            "data",
            "metadata",
            "output",
            "episodic_memories",
            "semantic_facts",
            "artifacts",
            "compaction_facts",
        }

        # Extract standard fields
        kwargs = {
            k: result_payload.get(k) for k in standard_fields if k in result_payload
        }

        # Determine success if not explicitly set
        if "success" not in kwargs:
            kwargs["success"] = not bool(result_payload.get("error"))

        # Extract data field - if not present, use remaining non-standard fields
        if "data" not in kwargs or kwargs["data"] is None:
            data = {k: v for k, v in result_payload.items() if k not in standard_fields}
            kwargs["data"] = data if data else None

        # Auto-generate output if missing.
        if not kwargs.get("output"):
            if kwargs.get("error"):
                kwargs["output"] = f"Error: {kwargs['error']}"
            elif kwargs.get("data"):
                data = kwargs["data"]
                if isinstance(data, dict):
                    # Try common output fields, but exclude screenshot (handled separately in multimodal format)
                    # Screenshots should never be in text content - they're sent as image_url in multimodal messages
                    output_content = (
                        data.get("output")
                        or data.get("message")
                    )
                    if output_content:
                        kwargs["output"] = str(output_content)
                    elif "screenshot" not in data:
                        # Only use data dict if it doesn't contain screenshot
                        kwargs["output"] = str(data)
                    else:
                        # If only screenshot is present, use a generic message
                        kwargs["output"] = "Tool executed successfully"
                else:
                    kwargs["output"] = str(data)

        return cls(**kwargs)

    def format_for_history(
        self,
        tool_name: str,
    ) -> str:
        """
        Get pre-formatted message for conversation history.

        Tools must provide model-facing text through ``output``.

        Args:
            tool_name: Name of the tool that produced this result (for error messages only)

        Returns:
            Message string for history.
        """
        if self.output:
            return self.output

        if self.error:
            return f"Error: {self.error}"

        # Fallback to meaningful text from data for synthetic or payload-only results.
        if self.data:
            if isinstance(self.data, dict):
                output = (
                    self.data.get("output")
                    or self.data.get("message")
                )
                return str(output) if output is not None else str(self.data)
            return str(self.data)

        return f"Tool {tool_name} executed"
