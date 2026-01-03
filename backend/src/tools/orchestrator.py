"""
Tool Orchestrator for the Desktop Assistant.

This module coordinates tool execution requests, especially those involving
coordinate resolution for visual tools, and manages the communication with 
frontend tools.
"""

import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

from backend.src.core.interfaces.tool import ToolResult
from backend.src.core.services.context_factory import ContextFactory
from backend.src.llm.parser import ParsedResponse, ParsedToolCall
from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class ToolOrchestrator:
    """
    Orchestrates tool execution requests.
    
    Refactored to handle the new architecture where tool execution
    happens on the frontend. This class now primarily manages tool 
    discovery and coordinate resolution before tools are sent to the frontend.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        config: Any,
        context_factory: Optional[ContextFactory] = None,
    ):
        """
        Initialize the tool orchestrator.

        Args:
            tool_registry: Registry of available tools
            config: Application configuration
            context_factory: Optional ContextFactory instance
        """
        self.tool_registry = tool_registry
        self.config = config

        # Use registry's context factory if not provided
        if context_factory is None:
            self.context_factory = tool_registry.context_factory
        else:
            self.context_factory = context_factory

    async def execute_tools_from_response(
        self,
        parsed_response: ParsedResponse,
        user_id: str = "default_user",
        session_id: str = "default_session",
        session_ref: Optional["AgentSession"] = None,
    ) -> Any:
        """
        Execute all tool calls from a parsed LLM response by waiting for frontend results.
        
        NOTE: In the new architecture, actual execution happens on the frontend.
        This method waits for the results to be returned via the ToolResultHandler.
        """
        import asyncio
        from types import SimpleNamespace
        from backend.src.core.interfaces.tool import ToolResult
        
        if not session_ref:
            logger.error("session_ref is required for execute_tools_from_response")
            return SimpleNamespace(tool_results=[])

        results = []
        for tool_call in parsed_response.tool_calls:
            request_id = tool_call.metadata.get('request_id')
            if not request_id:
                logger.warning(f"Tool call {tool_call.tool_name} missing request_id in metadata")
                # Fallback to placeholder if no request_id (shouldn't happen with ToolPreparer)
                results.append(SimpleNamespace(
                    tool_call=tool_call,
                    result=ToolResult(
                        success=True,
                        llm_content=f"Tool {tool_call.tool_name} executing on frontend...",
                        data={"status": "pending_frontend_execution"}
                    ),
                    success=True,
                    execution_time=0,
                    context=None
                ))
                continue

            # Check if result is already in _pending_tool_results (rare race condition)
            if hasattr(session_ref, '_pending_tool_results') and request_id in session_ref._pending_tool_results:
                tool_result = session_ref._pending_tool_results.pop(request_id)
                logger.info(f"Found already completed result for request_id {request_id}")
            else:
                # Create future and wait for it
                future = asyncio.Future()
                session_ref._tool_result_futures[request_id] = future
                
                try:
                    logger.info(f"Waiting for frontend tool result (request_id={request_id})...")
                    # Wait for the result with a timeout
                    tool_result = await asyncio.wait_for(future, timeout=120.0) # 2 min timeout for tools
                    logger.info(f"Received result for request_id {request_id}")
                except asyncio.TimeoutError:
                    logger.error(f"Timed out waiting for tool {tool_call.tool_name} (request_id={request_id})")
                    tool_result = ToolResult(
                        success=False,
                        error=f"Timed out waiting for tool {tool_call.tool_name} execution on frontend.",
                        llm_content=f"Error: Tool {tool_call.tool_name} timed out on frontend."
                    )
                finally:
                    # Clean up future
                    if request_id in session_ref._tool_result_futures:
                        del session_ref._tool_result_futures[request_id]
            
            # Create a result object compatible with InteractionLoop's expectations
            results.append(SimpleNamespace(
                tool_call=tool_call,
                result=tool_result,
                success=tool_result.success,
                execution_time=0.1, # Dummy execution time
                context=None
            ))
            
        return SimpleNamespace(tool_results=results)

    def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get information about all available tools.

        Returns:
            List of tool information dictionaries
        """
        tools = []
        for tool_name in self.tool_registry.get_tool_names():
            capabilities = self.tool_registry.get_tool_capabilities(tool_name)
            if capabilities:
                tools.append(capabilities)
        return tools
