"""
Marketplace Tool Template.

Copy this file to create a new marketplace tool. Follow these steps:

1. Copy this file to your tool directory: `tools/verified/your_tool_name/tool.py`
2. Rename the class and update the name/description
3. Define your arguments model (YourToolArgs)
4. Implement the run() method
5. Create a manifest.json file (see manifest_template.json)
6. Register your tool via entry point in setup.py or pyproject.toml

For detailed instructions, see: docs/MARKETPLACE_DEVELOPMENT.md
"""

import logging
from typing import Dict, Any
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

logger = logging.getLogger(__name__)


class YourToolArgs(BaseModel):
    """
    Arguments for your tool.
    
    Use Pydantic Field() to add descriptions and validation.
    These descriptions help the LLM understand how to use your tool.
    """
    # Example: required string argument
    required_param: str = Field(
        ...,
        description="A required parameter with description"
    )
    
    # Example: optional argument with default
    optional_param: str = Field(
        default="default_value",
        description="An optional parameter with a default value"
    )
    
    # Example: boolean flag
    enable_feature: bool = Field(
        default=False,
        description="Whether to enable a specific feature"
    )


class YourTool(Tool[YourToolArgs]):
    """
    Your tool description here.
    
    Provide a clear, concise description of what your tool does.
    This description is used by the LLM to decide when to use your tool.
    """
    name = "your_tool_name"  # Must be snake_case, unique across all tools
    description = "A clear description of what your tool does and when to use it."
    args_model = YourToolArgs

    def __init__(self):
        """
        Initialize your tool.
        
        If your tool needs dependencies (like file services, APIs, etc.),
        access them via the Context.services dict in the run() method.
        Do NOT inject dependencies in __init__ - tools should be stateless.
        """
        # Initialize any required resources here
        # Example: self.api_client = SomeAPIClient()
        pass

    async def run(self, args: YourToolArgs, ctx: Context) -> Dict[str, Any]:
        """
        Execute your tool.

        Args:
            args: Validated arguments (YourToolArgs)
            ctx: Execution context containing:
                - ctx.user: UserContext (user_id, username, permissions)
                - ctx.session: SessionContext (session_id, created_at, metadata)
                - ctx.workspace_root: str (workspace directory path)
                - ctx.services: Dict[str, Any] (access to services like file_service, storage_service, etc.)

        Returns:
            Dict with the following structure:
            {
                "success": bool,           # Whether execution succeeded
                "data": Any,               # Tool-specific result data
                "llm_content": str,        # Content for LLM to read
                "return_display": str,     # Content to display to user
                "error": str,              # Error message (if success=False)
            }
        """
        try:
            # Access services from context if needed
            # file_service = ctx.services.get("file_service")
            # storage_service = ctx.services.get("storage_service")
            
            # Access user/session info
            user_id = ctx.user.user_id
            session_id = ctx.session.session_id
            
            # Your tool logic here
            # result = await some_operation(args.required_param)
            
            logger.info(f"Tool {self.name} executed for user {user_id}")
            
            return {
                "success": True,
                "data": {
                    # Your result data here
                    "result": "example_result",
                },
                "llm_content": "Tool executed successfully. Result: ...",
                "return_display": "Tool completed successfully",
            }

        except Exception as e:
            logger.error(f"Error in {self.name}: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Tool execution failed: {str(e)}",
                "llm_content": f"Error: {str(e)}",
                "return_display": f"Error: {str(e)}",
            }

