"""
Tool Orchestrator for the Desktop Assistant.

This module coordinates tool execution requests, especially those involving
coordinate resolution for visual tools, and manages the communication with 
frontend tools.
"""

import logging
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

from backend.src.agent.tools.shared.bundle_detection import is_atomic_bundle
from backend.src.core.services.context_factory import ContextFactory
from backend.src.llm.parser import ParsedResponse
from backend.src.tools.bundle_execution import execute_bundle
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.result_helpers import create_empty_tool_results
from backend.src.tools.single_tool_execution import execute_single_tool

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
        if not session_ref:
            logger.error("session_ref is required for execute_tools_from_response")
            return create_empty_tool_results()

        # Check if this is a bundle (all tools have bundle_id, no individual request_ids)
        if is_atomic_bundle(parsed_response):
            # ATOMIC BUNDLE: Single future for entire bundle
            bundle_id = parsed_response.tool_calls[0].metadata.get('bundle_id')
            if not bundle_id:
                logger.error("Bundle detected but bundle_id missing from metadata")
                return create_empty_tool_results()
            
            return await execute_bundle(parsed_response, bundle_id, session_ref)
        
        # SINGLE TOOLS: Execute each tool individually
        results = []
        for tool_call in parsed_response.tool_calls:
            result = await execute_single_tool(tool_call, session_ref)
            results.append(result)
        
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
