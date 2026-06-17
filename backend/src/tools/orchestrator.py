"""
Tool result orchestrator for WindieOS.

This module coordinates tool execution requests by waiting for local-runtime
tool results and assembling tool result objects for the agent loop.
"""

import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

from backend.src.core.services.context_factory import ContextFactory
from backend.src.llm.parser import ParsedResponse
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.result_helpers import create_empty_tool_results
from backend.src.tools.result_types import ToolExecutionBatch

logger = logging.getLogger(__name__)


class ToolResultOrchestrator:
    """
    Orchestrates tool execution requests by waiting for local-runtime results.
    
    In the current architecture, tool execution happens in the SDK/local runtime.
    This class waits for results and assembles ToolResult objects for processing.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        context_factory: Optional[ContextFactory] = None,
    ):
        """
        Initialize the tool orchestrator.

        Args:
            tool_registry: Registry of available tools
            context_factory: Optional ContextFactory instance
        """
        self.tool_registry = tool_registry

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
    ) -> ToolExecutionBatch:
        """
        Execute all tool calls from a parsed LLM response by waiting for local-runtime results.
        
        NOTE: In the modular architecture, actual execution happens in the SDK/local runtime.
        This method waits for the results to be returned via the ToolResultHandler.
        """
        # Lazy import avoids package-init circular import during selective test collection.
        from backend.src.agent.tools.shared.bundle_detection import is_atomic_bundle
        from backend.src.tools.bundle_execution import execute_bundle
        from backend.src.tools.single_tool_execution import execute_single_tool

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
        
        return ToolExecutionBatch(tool_results=results)
