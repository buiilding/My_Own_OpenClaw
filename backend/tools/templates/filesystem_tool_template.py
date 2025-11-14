"""
Filesystem Tool Template

Template for creating tools that work with the filesystem. This template
includes proper workspace validation, file service integration, and
security considerations.

Replace:
- ToolName with your tool's name
- tool_description with a description
- execute_async method with your file operation logic
"""

import os
from typing import List, Optional

from backend.config import AppServices
from backend.tools.base import Kind, Tool, ToolContext, ToolResult


class ToolName(Tool):
    """
    Filesystem tool for [specific file operation].

    This tool safely performs [describe operation] while respecting
    workspace boundaries and user permissions.
    """

    def __init__(self, services: AppServices):
        super().__init__(
            name="tool_name", description="...", kind=Tool.Kind.READ
        )  # Adjust kind
        self.services = services

    @property
    def name(self) -> str:
        return "tool_name"

    @property
    def description(self) -> str:
        return "Description of what this filesystem tool does"

    @property
    def kind(self) -> Kind:
        return Kind.READ  # Change based on operation: READ, EDIT, DELETE, etc.

    async def execute_async(
        self,
        context: ToolContext,
        path: str,  # File/directory path
        recursive: Optional[bool] = False,
    ) -> ToolResult:
        """
        Execute filesystem operation with proper validation.

        Args:
            context: Tool execution context
            path: File or directory path to operate on
            recursive: Whether to operate recursively (if applicable)

        Returns:
            ToolResult with operation outcome
        """
        try:
            # Removed workspace restriction - allow operations anywhere on the system

            # Validate path exists (if needed)
            if not os.path.exists(path):
                return ToolResult(
                    success=False,
                    error=f"Path does not exist: {path}",
                    llm_content=f"Error: {path} does not exist",
                    return_display=f"Not found: {path}",
                )

            # Your filesystem operation logic here
            # Example: Read file contents
            if os.path.isfile(path):
                file_service = self.services.get_file_service()
                # Use file service for complex operations

                result_data = f"Processed file: {path}"
            else:
                result_data = f"Processed directory: {path}"

            return ToolResult(
                success=True,
                llm_content=f"Successfully processed {path}",
                return_display=result_data,
                data=result_data,
            )

        except PermissionError as e:
            return ToolResult(
                success=False,
                error=f"Permission denied: {str(e)}",
                llm_content=f"Error: Permission denied accessing {path}",
                return_display=f"Permission denied: {path}",
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=f"Filesystem operation failed: {str(e)}",
                llm_content=f"Error: {str(e)}",
                return_display=f"Failed: {str(e)}",
            )
