"""
Example SDK Tool Template

This is a template for creating new SDK tools. Copy this file and modify it
to create your own tool.

See tool_development.md for detailed documentation.
"""
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class ExampleToolArgs(BaseModel):
    """
    Arguments for the ExampleTool.

    Use Pydantic Field to provide descriptions that help the LLM understand
    what each parameter does.
    """
    model_config = ConfigDict(extra='forbid')

    required_param: str = Field(
        ...,
        description="A required parameter. Describe what it does and any constraints."
    )
    
    optional_param: Optional[int] = Field(
        None,
        description="An optional parameter with a default value. Describe its purpose."
    )
    
    # Add validation if needed
    # @validator('required_param')
    # def validate_param(cls, v):
    #     if len(v) < 3:
    #         raise ValueError("required_param must be at least 3 characters")
    #     return v


class ExampleTool(Tool[ExampleToolArgs]):
    """
    Example Tool - A template for creating new tools.
    
    Replace this description with a clear explanation of what your tool does.
    The description is used by the LLM to decide when to use this tool.
    """
    
    name = "example_tool"
    description = (
        "A clear, concise description of what this tool does. "
        "Explain when and why the LLM should use this tool."
    )
    args_model = ExampleToolArgs
    
    async def run(self, args: ExampleToolArgs, ctx: ToolContext) -> Dict[str, Any]:
        """
        Execute the tool.
        
        Args:
            args: Validated arguments (instance of ExampleToolArgs)
            ctx: Execution context containing:
                - workspace_root: Current workspace root path
                - services: Dictionary of available services
                    - config: AppConfig instance
                    - file_service: FileService instance
                    - workspace_context: WorkspaceContext instance
                    - storage: StorageService instance
        
        Returns:
            Dictionary with execution results. Must include:
                - success: bool
                - llm_content: str (required)
                - return_display: str (optional, for UI display)
                - error: str (if failed)
                - artifacts: dict (optional, for screenshots, files, etc.)
                - episodic_memories: list (optional)
                - semantic_facts: list (optional)
        """
        try:
            # Access configuration if needed
            config = ctx.services.get("config")
            
            # Access file service if needed
            file_service = ctx.services.get("file_service")
            
            # Access workspace root
            workspace_root = ctx.workspace_root
            
            # Your tool logic here
            logger.info(f"Executing {self.name} with args: {args}")
            
            # Example: Process the input
            result = self._process_input(args.required_param, args.optional_param)
            
            # Return success result
            return {
                "success": True,
                "llm_content": f"Successfully processed '{args.required_param}'. Result: {result}",
                "return_display": f"✓ Processed: {result}",
                # Optional: Add artifacts if needed
                # "artifacts": {"data": result},
            }
        
        except ValueError as e:
            # Handle validation errors
            error_msg = str(e)
            logger.error(f"Validation error in {self.name}: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "llm_content": f"Error: {error_msg}"
            }
        
        except Exception as e:
            # Handle unexpected errors
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(f"Error in {self.name}: {error_msg}", exc_info=True)
            return {
                "success": False,
                "error": error_msg,
                "llm_content": f"Error executing {self.name}: {error_msg}"
            }
    
    def _process_input(self, required: str, optional: Optional[int]) -> str:
        """
        Internal helper method.
        
        Extract complex logic into helper methods for better readability.
        """
        # Your processing logic here
        result = f"Processed {required}"
        if optional:
            result += f" with option {optional}"
        return result
    
    def get_capabilities(self) -> Dict[str, Any]:
        """
        Declare tool capabilities.
        
        Returns:
            Dictionary with capability flags:
                - requires_screenshot: bool (screenshots are automatically captured by frontend after execution)
                - modifies_filesystem: bool (tool modifies files)
                - network_access: bool (tool makes network requests)
                - timeout: float (execution timeout in seconds)
        """
        return {
            "requires_screenshot": False,
            "modifies_filesystem": False,
            "network_access": False,
            "timeout": 30.0
        }

