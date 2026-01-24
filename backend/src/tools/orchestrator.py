"""
Tool Orchestrator for the Desktop Assistant.

This module coordinates tool execution requests, especially those involving
coordinate resolution for visual tools, and manages the communication with 
frontend tools.
"""

import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional, Tuple


def _short_id(request_id: str, length: int = 15) -> str:
    """Truncate request_id to specified length for logging."""
    return request_id[:length] if request_id else "unknown"

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession

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

        # Check if this is a bundle (all tools have bundle_id, no individual request_ids)
        is_bundle = (
            len(parsed_response.tool_calls) > 1 and
            all(
                hasattr(tc, 'metadata') and 
                tc.metadata and 
                'bundle_id' in tc.metadata and 
                'request_id' not in tc.metadata
                for tc in parsed_response.tool_calls
            )
        )
        
        if is_bundle:
            # ATOMIC BUNDLE: Single future for entire bundle
            bundle_id = parsed_response.tool_calls[0].metadata.get('bundle_id')
            if not bundle_id:
                logger.error("Bundle detected but bundle_id missing from metadata")
                return SimpleNamespace(tool_results=[])
            
            logger.info(f"Processing atomic bundle: {len(parsed_response.tool_calls)} tools (bundle_id={_short_id(bundle_id)})")
            
            # Create single bundle future
            bundle_future = session_ref._tool_result_storage.create_bundle_future(bundle_id)
            
            # Check if bundle result already exists
            bundle_result = session_ref._tool_result_storage.get_bundled_result(bundle_id)
            if bundle_result:
                session_ref._tool_result_storage.remove_bundled_result(bundle_id)
                if not bundle_future.done():
                    bundle_future.set_result(bundle_result)
                logger.info(f"Found already completed bundle result for bundle_id {_short_id(bundle_id)}")
            else:
                # Wait for bundle result
                try:
                    wait_start = time.perf_counter()
                    logger.info(f"Waiting for frontend bundle result (bundle_id={_short_id(bundle_id)})...")
                    bundle_result = await asyncio.wait_for(bundle_future, timeout=120.0)
                    wait_time = time.perf_counter() - wait_start
                    logger.info(f"[Timing] Bundle orchestrator wait completed in {wait_time:.3f}s (bundle_id={_short_id(bundle_id)})")
                except asyncio.TimeoutError:
                    logger.error(f"Timed out waiting for bundle (bundle_id={_short_id(bundle_id)})")
                    bundle_result = ToolResult(
                        success=False,
                        error="Timed out waiting for bundle execution on frontend.",
                        llm_content="Error: Bundle execution timed out on frontend."
                    )
                finally:
                    session_ref._tool_result_storage.remove_bundle_future(bundle_id)
            
            # Extract step_results from bundle result and create individual results
            # This maintains compatibility with existing code that expects individual tool results
            results = []
            step_results = bundle_result.data.get("step_results", []) if isinstance(bundle_result.data, dict) else []
            
            for i, tool_call in enumerate(parsed_response.tool_calls):
                # Find corresponding step result
                step_result = step_results[i] if i < len(step_results) else None
                
                if step_result and step_result.get("status") == "ok":
                    tool_result = ToolResult(
                        success=True,
                        llm_content=step_result.get("output", ""),
                        data=bundle_result.data  # Include screenshot, system_state from bundle
                    )
                else:
                    error_msg = step_result.get("output", "Unknown error") if step_result else bundle_result.error or "Bundle execution failed"
                    tool_result = ToolResult(
                        success=False,
                        error=error_msg,
                        llm_content=f"Error: {error_msg}"
                    )
                
                results.append(SimpleNamespace(
                    tool_call=tool_call,
                    result=tool_result,
                    success=tool_result.success,
                    execution_time=0.1,
                    context=None
                ))
            
            return SimpleNamespace(tool_results=results)
        
        # SINGLE TOOLS: Existing behavior
        results = []
        for tool_call in parsed_response.tool_calls:
            request_id = tool_call.metadata.get('request_id') if hasattr(tool_call, 'metadata') else None
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
            
            # Use prepared tool call if available (avoids using mutated original)
            # Prepared tool calls have resolved coordinates and are immutable
            # ENCAPSULATION: Use public method instead of accessing private member
            prepared_call = None
            if session_ref:
                prepared_call = session_ref.get_prepared_tool_call(request_id)
            
            # STALE SCREEN EXECUTION FIX: Verify screenshot is still valid before execution
            # If the screen changed since coordinate resolution, the coordinates might point
            # to the wrong UI element, causing dangerous unintended actions.
            if prepared_call and session_ref:
                resolution_screenshot_id = prepared_call.metadata.get("coordinate_resolution_screenshot_id") if prepared_call.metadata else None
                current_screenshot_id = session_ref.get_current_screenshot_id()
                
                if resolution_screenshot_id and current_screenshot_id and resolution_screenshot_id != current_screenshot_id:
                    logger.warning(
                        f"[request_id={_short_id(request_id)}] STALE SCREEN DETECTED: "
                        f"Coordinates were resolved using screenshot {resolution_screenshot_id[:8]}, "
                        f"but current screenshot is {current_screenshot_id[:8]}. "
                        f"Screen changed before execution - tool will fail to prevent dangerous actions."
                    )
                    # Fail the tool to prevent executing on wrong screen
                    results.append(SimpleNamespace(
                        tool_call=tool_call,
                        result=ToolResult(
                            success=False,
                            error="Screen changed before tool execution. Coordinates are no longer valid.",
                            llm_content="Error: The screen state changed after coordinate resolution. Please try again."
                        ),
                        success=False,
                        execution_time=0,
                        context=None
                    ))
                    continue
            
            # Use prepared call if available, otherwise fall back to original
            # The prepared call has the same structure but with resolved coordinates
            effective_tool_call = prepared_call.to_parsed_call() if prepared_call else tool_call

            # Initialize session attributes if needed
            if not hasattr(session_ref, '_pending_tool_results'):
                session_ref._pending_tool_results = {}
            if not hasattr(session_ref, '_tool_result_futures'):
                session_ref._tool_result_futures = {}
            
            # Create future FIRST to avoid race condition where result arrives
            # between checking storage and creating the future
            # Use centralized storage for futures
            future = session_ref._tool_result_storage.create_result_future(request_id)
            # Also maintain legacy dict for backward compatibility
            session_ref._tool_result_futures[request_id] = future
            
            # Check if result already exists (may have arrived before we created the future)
            # This handles the race condition where frontend executes tool very quickly
            tool_result = session_ref._tool_result_storage.get_pending_result(request_id)
            if tool_result:
                # Remove from storage and resolve the future immediately
                session_ref._tool_result_storage.remove_pending_result(request_id)
                if not future.done():
                    future.set_result(tool_result)
                logger.info(f"Found already completed result for request_id {_short_id(request_id)}")
            else:
                # Result not yet available, wait for it
                try:
                    wait_start = time.perf_counter()
                    logger.info(f"Waiting for frontend tool result (request_id={_short_id(request_id)})...")
                    # Wait for the result with a timeout
                    tool_result = await asyncio.wait_for(future, timeout=120.0) # 2 min timeout for tools
                    wait_time = time.perf_counter() - wait_start
                    logger.info(f"[Timing] Tool orchestrator wait completed in {wait_time:.3f}s (request_id={_short_id(request_id)}, tool={tool_call.tool_name})")
                    logger.info(f"Received result for request_id {_short_id(request_id)}")
                except asyncio.TimeoutError:
                    logger.error(f"Timed out waiting for tool {tool_call.tool_name} (request_id={_short_id(request_id)})")
                    tool_result = ToolResult(
                        success=False,
                        error=f"Timed out waiting for tool {tool_call.tool_name} execution on frontend.",
                        llm_content=f"Error: Tool {tool_call.tool_name} timed out on frontend."
                    )
                finally:
                    # Clean up future
                    if request_id in session_ref._tool_result_futures:
                        # Use centralized storage for cleanup
                        session_ref._tool_result_storage.remove_result_future(request_id)
                        # Also clean up legacy dict
                        del session_ref._tool_result_futures[request_id]
            
            # Create a result object compatible with InteractionLoop's expectations
            # Use effective_tool_call (prepared if available, original otherwise)
            results.append(SimpleNamespace(
                tool_call=effective_tool_call,
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
