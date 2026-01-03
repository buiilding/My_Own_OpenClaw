"""
Tool Result Handler for Frontend Tool Execution Results.

Handles tool-result messages from the frontend, replacing RemoteToolResult
placeholders with actual execution results including screenshots.
"""
import logging
from typing import Any, Dict

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
        
        # Convert frontend result to ToolResult format
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
        
        # Get session and update tool execution result
        session = self.session_manager.get_session(user_id)
        if not session:
            logger.warning(f"No session found for user {user_id}")
            return

        # Proactive OCR and Screenshot Update
        if screenshot_data:
            session.latest_screenshot = screenshot_data
            # Trigger async OCR
            import asyncio
            from backend.src.core.services.gpu_memory_manager import GPUMemoryManager
            
            async def run_ocr_task():
                try:
                    # Clear GPU cache before OCR to free up memory
                    GPUMemoryManager.clear_all_caches()
                    GPUMemoryManager.log_memory_info("before OCR")
                    
                    # Get OCR plugin from session registry
                    ocr_plugin = None
                    if session.executor and session.executor.plugin_manager:
                        ocr_plugin = session.executor.plugin_manager.plugin_registry.get_plugin("ocr_analysis")
                    
                    if ocr_plugin and ocr_plugin.enabled:
                        results = await ocr_plugin.perform_ocr(screenshot_data)
                        if results:
                            session.latest_ocr_results = results
                            logger.info(f"Proactive OCR completed for request {request_id}")
                    
                    # Clear GPU cache after OCR to free memory for other services
                    GPUMemoryManager.clear_all_caches()
                    GPUMemoryManager.log_memory_info("after OCR")
                except Exception as e:
                    logger.error(f"Proactive OCR failed: {e}")
                    # Clear cache even on error
                    GPUMemoryManager.clear_all_caches()
            
            asyncio.create_task(run_ocr_task())

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
