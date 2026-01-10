"""
Tool Result Handler for Frontend Tool Execution Results.

Handles tool-result messages from the frontend, replacing RemoteToolResult
placeholders with actual execution results including screenshots.
"""
import asyncio
import logging
from typing import Any, Dict, Optional

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
        payload = data.get("payload", {})
        request_id = payload.get("request_id")
        success = payload.get("success", False)
        result_data = payload.get("data")
        error = payload.get("error")
        metadata = payload.get("metadata", {})
        system_context = payload.get("system_context")  # active_window, mouse_position, time
        
        logger.info(f"ToolResultHandler received message type='{data.get('type')}', request_id='{request_id}'")
        
        if not request_id:
            logger.warning(f"Tool result message missing request_id. Full data: {list(data.keys())}")
            return
        
        logger.debug(
            f"Received tool result from frontend: request_id={request_id}, "
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
        if isinstance(result_data, dict) and result_data.get("bundled"):
            logger.info(f"Received bundled tool result with {len(result_data.get('tools', []))} tools")
            await self._handle_bundled_result(session, result_data, request_id, system_context)
            return
        
        # Convert frontend result to ToolResult format (for individual tool results)
        # Check for pre-formatted content flag from frontend
        if isinstance(result_data, dict) and result_data.get("is_preformatted"):
            metadata["is_preformatted"] = True
            
        # Include system context in metadata if provided
        if system_context:
            metadata["system_context"] = system_context
        
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
            logger.debug(
                f"Tool result includes screenshot data "
                f"(length: {len(screenshot_data) if screenshot_data else 0})"
            )

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
                f"session_hidden_id={session.hidden_screenshot_request_id}, "
                f"received_id={request_id}"
            )
            if (not session.screenshot_waiter.done() and 
                session.hidden_screenshot_request_id == request_id):
                
                if screenshot_data:
                    session.screenshot_waiter.set_result(screenshot_data)
                    logger.info(f"Resolved hidden screenshot waiter for request {request_id}")
                else:
                    session.screenshot_waiter.set_exception(ValueError("No screenshot data in result"))
                    logger.warning(f"Hidden screenshot request {request_id} returned no data")
                
                # Reset waiter state
                session.screenshot_waiter = None
                session.hidden_screenshot_request_id = None
                
                # Don't process as normal tool result (it's hidden)
                return
        else:
            logger.debug(f"No active screenshot waiter for request {request_id}")

        # Store the tool result in session for tool execution to pick up
        if not hasattr(session, '_pending_tool_results'):
            session._pending_tool_results = {}
        
        session._pending_tool_results[request_id] = tool_result
        
        # Resolve any waiting futures for this request_id
        if hasattr(session, '_tool_result_futures') and request_id in session._tool_result_futures:
            future = session._tool_result_futures.get(request_id)
            if future and not future.done():
                future.set_result(tool_result)
                logger.info(f"Resolved tool result future for request_id {request_id}")
        
        logger.debug(
            f"Received tool result for request_id {request_id}. "
            f"Tool execution loop will now resume."
        )
    
    async def _handle_bundled_result(
        self,
        session: Any,
        bundle_data: Dict[str, Any],
        bundle_request_id: str,
        system_context: Optional[Dict[str, Any]]
    ) -> None:
        """
        Handle a bundled tool result by unpacking individual tool results.
        
        Args:
            session: AgentSession instance
            bundle_data: The data dict from the bundle result (contains 'tools' array and 'screenshot')
            bundle_request_id: The request_id of the bundle (for logging)
            system_context: Optional system context metadata
        """
        tools = bundle_data.get("tools", [])
        bundle_screenshot = bundle_data.get("screenshot")
        
        logger.info(f"Unpacking bundle result: {len(tools)} tools, has_screenshot={bundle_screenshot is not None}")
        
        # Initialize session attributes if needed
        if not hasattr(session, '_pending_tool_results'):
            session._pending_tool_results = {}
        if not hasattr(session, '_tool_result_futures'):
            session._tool_result_futures = {}
        
        # Process screenshot if present (update session and trigger OCR)
        if bundle_screenshot:
            session.latest_screenshot = bundle_screenshot
            logger.debug(
                f"Bundle result includes screenshot data "
                f"(length: {len(bundle_screenshot) if bundle_screenshot else 0})"
            )
            self._trigger_proactive_ocr(session, bundle_screenshot, bundle_request_id)
        
        # Process each individual tool result in the bundle
        for tool_result_data in tools:
            tool_request_id = tool_result_data.get("request_id")
            if not tool_request_id:
                logger.warning(f"Tool result in bundle missing request_id: {tool_result_data}")
                continue
            
            tool_name = tool_result_data.get("tool_name", "unknown")
            tool_success = tool_result_data.get("success", False)
            tool_data = tool_result_data.get("data")
            tool_error = tool_result_data.get("error")
            
            # Create ToolResult for this individual tool
            tool_metadata = {}
            if system_context:
                tool_metadata["system_context"] = system_context
            
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
                f"Processing bundled tool result: request_id={tool_request_id}, "
                f"tool={tool_name}, success={tool_success}"
            )
            
            # Store in pending results
            session._pending_tool_results[tool_request_id] = tool_result
            
            # Resolve waiting future for this tool's request_id
            if tool_request_id in session._tool_result_futures:
                future = session._tool_result_futures.get(tool_request_id)
                if future and not future.done():
                    future.set_result(tool_result)
                    logger.info(f"Resolved bundled tool result future for request_id {tool_request_id} (tool: {tool_name})")
                else:
                    logger.debug(f"Future for {tool_request_id} already done or missing")
            else:
                logger.debug(f"No waiting future for bundled tool request_id {tool_request_id}")
        
        logger.info(f"Finished unpacking bundle result {bundle_request_id}")
    
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
                        logger.info(f"Proactive OCR completed for request {request_id}")
            except Exception as e:
                logger.error(f"Proactive OCR failed: {e}")
            finally:
                # Always set the event, even if OCR failed, to unblock waiting tools
                if hasattr(session, 'ocr_completion_event') and session.ocr_completion_event is not None:
                    session.ocr_completion_event.set()
        
        asyncio.create_task(run_ocr_task())
