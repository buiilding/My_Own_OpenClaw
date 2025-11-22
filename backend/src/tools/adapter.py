import logging
from typing import Any, Dict, List

from pydantic import ValidationError

# Legacy Interfaces
from backend.src.core.interfaces.tool import (
    ToolInterface,
    ToolResult,
    ToolContext as LegacyToolContext,
    Kind
)

# New SDK
from backend.sdk.tool import Tool as SDKTool
from backend.sdk.context import Context, UserContext, SessionContext
from backend.src.core.security.executor import get_tool_executor

logger = logging.getLogger(__name__)

class SDKToolAdapter(ToolInterface):
    """
    Adapts a new SDK-based Tool to the legacy ToolInterface.
    Allows the existing Executor to run new tools without modification.
    """

    def __init__(self, sdk_tool: SDKTool):
        self.sdk_tool = sdk_tool
        self._kind = Kind.OTHER # Default for now, or inspect sdk_tool if we add metadata
        self.executor = get_tool_executor()

    @property
    def name(self) -> str:
        return self.sdk_tool.name

    @property
    def description(self) -> str:
        return self.sdk_tool.description

    @property
    def kind(self) -> Kind:
        return self._kind

    async def execute_async(self, context: LegacyToolContext, **kwargs) -> ToolResult:
        """
        Maps legacy execution to SDK execution.
        """
        try:
            # 1. Validate/Parse Arguments using Pydantic
            try:
                args = self.sdk_tool.args_model(**kwargs)
            except ValidationError as e:
                return ToolResult(
                    success=False,
                    error=f"Invalid parameters: {str(e)}",
                    llm_content=f"Error: Invalid parameters for {self.name}: {str(e)}"
                )

            # 2. Build New Context from Legacy Context
            # Note: This is a best-effort mapping until we have full context support
            services = {}
            if context.tool_registry and hasattr(context.tool_registry, "services"):
                # Inject common services
                services["file_service"] = context.tool_registry.services.get_file_service()
                services["storage_service"] = context.tool_registry.services.storage
                services["workspace_context"] = context.tool_registry.services.get_workspace_context()

            new_ctx = Context(
                user=UserContext(
                    user_id="legacy_user", # TODO: Get from context if available
                ),
                session=SessionContext(
                    session_id="legacy_session",
                    created_at=0.0
                ),
                workspace_root=context.working_directory or ".",
                services=services
            )

            # 3. Run the Tool via Executor
            result = await self.executor.execute(self.sdk_tool, args, new_ctx)

            # 4. Map Result to Legacy ToolResult
            # Special handling for dict results with 'llm_content'
            if isinstance(result, dict) and "llm_content" in result:
                llm_content = result.pop("llm_content")
                return ToolResult(
                    success=True,
                    data=result,
                    llm_content=llm_content,
                    return_display=llm_content # Use same for display for now
                )
            elif isinstance(result, dict) and "error" in result:
                 return ToolResult(
                    success=False,
                    error=result["error"],
                    llm_content=f"Error: {result['error']}"
                )

            # Default wrapping
            return ToolResult(
                success=True,
                data=result,
                llm_content=str(result),
                return_display=str(result)
            )

        except Exception as e:
            logger.error(f"Error executing SDK tool {self.name}: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=str(e),
                llm_content=f"Error executing {self.name}: {str(e)}"
            )

    def validate_parameters(self, **kwargs) -> List[str]:
        """
        Uses Pydantic to validate parameters.
        """
        try:
            self.sdk_tool.args_model(**kwargs)
            return []
        except ValidationError as e:
            return [str(e)]

    def get_schema(self) -> Dict[str, Any]:
        """
        Returns the JSON schema from the SDK tool.
        """
        return self.sdk_tool.get_json_schema()

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "kind": self.kind.value,
            "parameters": self.get_schema(),
            "requires_context": True,
            "requires_screenshot": False # SDK tools handle this via plugins
        }

