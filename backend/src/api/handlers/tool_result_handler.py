"""
Tool Result Handler for Frontend Tool Execution Results.

Handles tool-result messages from the frontend, replacing RemoteToolResult
placeholders with actual execution results including screenshots.
"""
import asyncio
import logging
import time
from typing import Any, Dict, Optional


def _short_id(request_id: str, length: int = 15) -> str:
    """Truncate request_id to specified length for logging."""
    return request_id[:length] if request_id else "unknown"

from fastapi import WebSocket

from backend.src.api.handlers.base import MessageHandler
from backend.src.core.interfaces.tool import ToolResult

logger = logging.getLogger(__name__)


class ToolResultHandler(MessageHandler):
    """
    Handler for tool-result messages from frontend.
    
    When frontend tools execute, they send results back via this handler.
    The handler converts frontend results to ToolResult format and updates
    the session's tool execution results, ensuring screenshots and other
    data are properly included in conversation history.
    """
    
    def __init__(self, session_manager):
        """
        Initialize the tool result handler.
        
        Args:
            session_manager: SessionManager instance for accessing sessions
        """
        self.session_manager = session_manager
    
    async def handle(
        self,
        data: Dict[str, Any],
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """
        Handle tool-result message from frontend.
        
        Args:
            data: Message data with payload containing tool result
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        handler_start_time = time.perf_counter()
        payload = data.get("payload", {})
        request_id = payload.get("request_id")
        success = payload.get("success", False)
        result_data = payload.get("data")
        error = payload.get("error")
        metadata = payload.get("metadata", {})
        
        logger.info(f"[Timing] Tool result received from frontend (request_id={_short_id(request_id)})")
        logger.info(f"ToolResultHandler received message type='{data.get('type')}', request_id='{_short_id(request_id)}'")
        
        if not request_id:
            logger.warning(f"Tool result message missing request_id. Full data: {list(data.keys())}")
            return
        
        logger.debug(
            f"Received tool result from frontend: request_id={_short_id(request_id)}, "
            f"success={success}, has_data={result_data is not None}, has_metadata={bool(metadata)}"
        )
        
        # Get session early - needed for both bundled and individual results
        session = self.session_manager.get_session(user_id)
        if not session:
            logger.warning(f"No session found for user {user_id}")
            return
        
        # Handle bundled tool results
        # When frontend executes multiple tools as a bundle, it sends a single result
        # with bundled=true and a tools array containing individual tool results
        # Each tool result is pre-formatted with system context XML by the frontend
        if isinstance(result_data, dict) and result_data.get("bundled"):
            logger.info(f"Received bundled tool result with {len(result_data.get('tools', []))} tools")
            await self._handle_bundled_result(session, result_data, request_id)
            handler_total_time = time.perf_counter() - handler_start_time
            logger.info(f"[Timing] Bundled tool result handler completed in {handler_total_time:.3f}s (bundle_id={_short_id(request_id)})")
            return
        
        # Convert frontend result to ToolResult format (for individual tool results)
        # Frontend pre-formats messages with system context XML and sets is_preformatted flag
        if isinstance(result_data, dict) and result_data.get("is_preformatted"):
            metadata["is_preformatted"] = True
        
        tool_result = ToolResult.from_dict({
            "success": success,
            "data": result_data,
            "error": error,
            "metadata": metadata,
        })
        
        # Extract screenshot data for logging
        screenshot_data = None
        if isinstance(tool_result.data, dict) and "screenshot" in tool_result.data:
            screenshot_data = tool_result.data["screenshot"]
            logger.debug("Tool result includes screenshot data")

        # Proactive OCR and Screenshot Update
        # When a screenshot arrives, trigger proactive OCR asynchronously (non-blocking)
        # This allows tool result processing and LLM communication to continue immediately
        # Tools that need OCR results (e.g., mouse_control with find_coordinates_by="ocr")
        # will wait for ocr_completion_event before using latest_ocr_results
        if screenshot_data:
            session.latest_screenshot = screenshot_data
            self._trigger_proactive_ocr(session, screenshot_data, request_id)

        # Check for hidden screenshot waiter
        if session.screenshot_waiter:
            logger.info(
                f"Checking hidden screenshot waiter: session_waiter_done={session.screenshot_waiter.done()}, "
                f"session_hidden_id={_short_id(session.hidden_screenshot_request_id) if session.hidden_screenshot_request_id else None}, "
                f"received_id={_short_id(request_id)}"
            )
            if (not session.screenshot_waiter.done() and 
                session.hidden_screenshot_request_id == request_id):
                
                if screenshot_data:
                    session.screenshot_waiter.set_result(screenshot_data)
                    logger.info(f"Resolved hidden screenshot waiter for request {_short_id(request_id)}")
                else:
                    session.screenshot_waiter.set_exception(ValueError("No screenshot data in result"))
                    logger.warning(f"Hidden screenshot request {_short_id(request_id)} returned no data")
                
                # Reset waiter state
                session.screenshot_waiter = None
                session.hidden_screenshot_request_id = None
                
                # Don't process as normal tool result (it's hidden)
                return
        else:
            logger.debug(f"No active screenshot waiter for request {_short_id(request_id)}")

        # Store the tool result in session for tool execution to pick up
        if not hasattr(session, '_pending_tool_results'):
            session._pending_tool_results = {}
        
        session._pending_tool_results[request_id] = tool_result
        
        # Resolve any waiting futures for this request_id
        if hasattr(session, '_tool_result_futures') and request_id in session._tool_result_futures:
            future = session._tool_result_futures.get(request_id)
            if future and not future.done():
                future.set_result(tool_result)
                logger.info(f"Resolved tool result future for request_id {_short_id(request_id)}")
        
        handler_total_time = time.perf_counter() - handler_start_time
        logger.info(f"[Timing] Tool result handler completed in {handler_total_time:.3f}s (request_id={_short_id(request_id)})")
        logger.debug(
            f"Received tool result for request_id {_short_id(request_id)}. "
            f"Tool execution loop will now resume."
        )
    
    async def _handle_bundled_result(
        self,
        session: Any,
        bundle_data: Dict[str, Any],
        bundle_request_id: str
    ) -> None:
        """
        Handle a bundled tool result by storing individual tool results for orchestrator
        and creating a combined bundled result for history.
        
        Each tool result is pre-formatted with system context XML by the frontend.
        Individual results are stored for orchestrator matching, but a combined result
        is also created for single-message history storage.
        
        Args:
            session: AgentSession instance
            bundle_data: The data dict from the bundle result (contains 'tools' array, 'combined_llm_content', and 'screenshot')
            bundle_request_id: The request_id of the bundle (for logging)
        """
        tools = bundle_data.get("tools", [])
        bundle_screenshot = bundle_data.get("screenshot")
        combined_llm_content = bundle_data.get("combined_llm_content")
        
        logger.info(f"Processing bundle result: {len(tools)} tools, has_screenshot={bundle_screenshot is not None}, has_combined_content={combined_llm_content is not None}")
        
        # Initialize session attributes if needed
        if not hasattr(session, '_pending_tool_results'):
            session._pending_tool_results = {}
        if not hasattr(session, '_tool_result_futures'):
            session._tool_result_futures = {}
        if not hasattr(session, '_bundled_results'):
            session._bundled_results = {}
        
        # Process screenshot if present (update session and trigger OCR)
        if bundle_screenshot:
            session.latest_screenshot = bundle_screenshot
            logger.debug("Bundle result includes screenshot data")
            self._trigger_proactive_ocr(session, bundle_screenshot, bundle_request_id)
        
        # Store individual tool results for orchestrator matching (still needed for request_id resolution)
        for tool_result_data in tools:
            tool_request_id = tool_result_data.get("request_id")
            if not tool_request_id:
                logger.warning(f"Tool result in bundle missing request_id: {tool_result_data}")
                continue
            
            tool_name = tool_result_data.get("tool_name", "unknown")
            tool_success = tool_result_data.get("success", False)
            tool_data = tool_result_data.get("data")
            tool_error = tool_result_data.get("error")
            
            # Create ToolResult for this individual tool (for orchestrator matching)
            tool_metadata = {}
            if isinstance(tool_data, dict) and tool_data.get("is_preformatted"):
                tool_metadata["is_preformatted"] = True
            
            # Include screenshot in tool result data if present
            if bundle_screenshot and isinstance(tool_data, dict):
                tool_data = tool_data.copy()
                tool_data["screenshot"] = bundle_screenshot
            
            tool_result = ToolResult.from_dict({
                "success": tool_success,
                "data": tool_data,
                "error": tool_error,
                "metadata": tool_metadata,
            })
            
            logger.debug(
                f"Storing bundled tool result for orchestrator: request_id={tool_request_id}, "
                f"tool={tool_name}, success={tool_success}"
            )
            
            # Store in pending results (for orchestrator to match by request_id)
            session._pending_tool_results[tool_request_id] = tool_result
            
            # Resolve waiting future for this tool's request_id
            if tool_request_id in session._tool_result_futures:
                future = session._tool_result_futures.get(tool_request_id)
                if future and not future.done():
                    future.set_result(tool_result)
                    logger.info(f"Resolved bundled tool result future for request_id {_short_id(tool_request_id)} (tool: {tool_name})")
                else:
                    logger.debug(f"Future for {_short_id(tool_request_id)} already done or missing")
            else:
                logger.debug(f"No waiting future for bundled tool request_id {_short_id(tool_request_id)}")
        
        # Create combined bundled result for history (single message instead of multiple)
        if combined_llm_content:
            # Create a combined ToolResult for the entire bundle
            combined_data = {
                "bundled": True,
                "tool_count": len(tools),
                "screenshot": bundle_screenshot,
            }
            
            combined_result = ToolResult.from_dict({
                "success": all(t.get("success", False) for t in tools),
                "data": combined_data,
                "error": None,
                "metadata": {
                    "is_preformatted": True,
                    "is_bundled": True,
                    "bundle_request_id": bundle_request_id,
                },
                "llm_content": combined_llm_content,
            })
            
            # Store combined result for history processing
            # Use bundle_request_id (from frontend) as the key
            # Note: This bundle_request_id is the frontend's correlationId, which is different
            # from the bundle_id generated in ToolPreparer. We'll match by checking if
            # we have multiple tool results and finding the bundled result.
            if not hasattr(session, '_bundled_results'):
                session._bundled_results = {}
            session._bundled_results[bundle_request_id] = combined_result
            logger.info(f"Stored combined bundled result for history (bundle_id={_short_id(bundle_request_id)})")
        else:
            logger.warning(f"Bundle result missing combined_llm_content, cannot create combined history message")
        
        logger.info(f"Finished processing bundle result {_short_id(bundle_request_id)}")
    
    def _trigger_proactive_ocr(
        self,
        session: Any,
        screenshot_data: str,
        request_id: str
    ) -> None:
        """
        Trigger proactive OCR asynchronously for a screenshot.
        
        This is a non-blocking operation that runs OCR in the background.
        Tools that need OCR results will wait for ocr_completion_event.
        
        Args:
            session: AgentSession instance
            screenshot_data: Base64-encoded screenshot data
            request_id: Request ID for logging purposes
        """
        async def run_ocr_task():
            try:
                # Initialize event if it doesn't exist (defensive check)
                if not hasattr(session, 'ocr_completion_event') or session.ocr_completion_event is None:
                    session.ocr_completion_event = asyncio.Event()
                
                # Clear OCR completion event before starting new OCR
                session.ocr_completion_event.clear()

                # Get OCR plugin from session registry
                ocr_plugin = None
                if session.executor and session.executor.plugin_manager:
                    ocr_plugin = session.executor.plugin_manager.plugin_registry.get_plugin("ocr_analysis")
                
                if ocr_plugin and ocr_plugin.enabled:
                    # perform_ocr is now properly async and handles GPU cache management internally in a thread
                    results = await ocr_plugin.perform_ocr(screenshot_data)
                    if results:
                        session.latest_ocr_results = results
                        logger.info(f"Proactive OCR completed for request {_short_id(request_id)}")
            except Exception as e:
                logger.error(f"Proactive OCR failed: {e}")
            finally:
                # Always set the event, even if OCR failed, to unblock waiting tools
                if hasattr(session, 'ocr_completion_event') and session.ocr_completion_event is not None:
                    session.ocr_completion_event.set()
        
        asyncio.create_task(run_ocr_task())
