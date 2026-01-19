"""
Tool Result Handler.

Handles tool result processing from the frontend.
Extracted from AgentSession to reduce god object complexity.
"""
import asyncio
import hashlib
import logging
from typing import Any, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession

logger = logging.getLogger(__name__)


class ToolResultHandler:
    """
    Handles tool result processing from the frontend.
    
    Responsibility: Tool result routing, storage, and OCR triggering.
    Separated from AgentSession to improve testability and reduce coupling.
    """
    
    def __init__(self, session: "AgentSession"):
        """
        Initialize the tool result handler.
        
        Args:
            session: Agent session for state access
        """
        self.session = session
    
    async def process_frontend_tool_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
        metadata: Dict[str, Any]
    ) -> None:
        """
        Process a tool result from the frontend.
        
        Public entry point that delegates to internal methods.
        Routes to appropriate handler based on result type.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data (may contain bundled flag)
            error: Error message if execution failed
            metadata: Additional metadata
        """
        # Route to appropriate handler based on result type
        if isinstance(result_data, dict) and result_data.get("bundled"):
            await self._handle_bundled_results(result_data, request_id)
            return
        
        # Handle hidden screenshot requests
        if self._is_screenshot_waiter_request(request_id):
            await self._handle_screenshot_waiter(request_id, result_data)
            return
        
        # Handle individual tool result
        await self._handle_individual_result(request_id, success, result_data, error, metadata)
    
    def _is_screenshot_waiter_request(self, request_id: str) -> bool:
        """
        Check if request_id matches active screenshot waiter.
        
        SCREENSHOT REQUEST RACE FIX: Checks both new dict-based tracking and legacy
        single waiter for backward compatibility.
        
        Args:
            request_id: Request ID to check
            
        Returns:
            True if this is a hidden screenshot request
        """
        # Check new dict-based tracking (supports concurrent requests)
        if request_id in self.session._pending_screenshots:
            future = self.session._pending_screenshots[request_id]
            if future and not future.done():
                return True
        
        # Legacy check for backward compatibility
        return (
            self.session.screenshot_waiter is not None and
            not self.session.screenshot_waiter.done() and
            self.session.hidden_screenshot_request_id == request_id
        )
    
    async def _handle_screenshot_waiter(
        self,
        request_id: str,
        result_data: Optional[Dict[str, Any]]
    ) -> None:
        """
        Handle hidden screenshot request - resolves waiter and returns early.
        
        SCREENSHOT REQUEST RACE FIX: Uses request_id-based Future lookup to support
        concurrent screenshot requests. Each request gets its own Future, preventing
        race conditions.
        
        Args:
            request_id: Request ID for the screenshot
            result_data: Result data (may contain screenshot)
        """
        screenshot_data = None
        if isinstance(result_data, dict) and "screenshot" in result_data:
            screenshot_data = result_data["screenshot"]
        
        # SCREENSHOT REQUEST RACE FIX: Get Future from dict using request_id
        # This ensures we resolve the correct Future even if multiple requests are pending
        screenshot_future = self.session._pending_screenshots.pop(request_id, None)
        
        # Legacy support: Also check single waiter
        if screenshot_future is None:
            screenshot_future = self.session.screenshot_waiter
        
        if screenshot_future and not screenshot_future.done():
            if screenshot_data:
                # Store screenshot with ID and return tuple (screenshot_id, screenshot_data)
                screenshot_id = self._generate_screenshot_id(screenshot_data)
                # MEMORY LEAK FIX: Add with LRU eviction
                self.session._store_screenshot_with_eviction(screenshot_id, screenshot_data)
                self.session._current_screenshot_id = screenshot_id
                # Return tuple so ScreenshotManager can access screenshot_id
                screenshot_future.set_result((screenshot_id, screenshot_data))
                logger.info(f"Resolved hidden screenshot waiter for request {request_id[:15]} (screenshot_id={screenshot_id[:8]})")
            else:
                screenshot_future.set_exception(ValueError("No screenshot data in result"))
                logger.warning(f"Hidden screenshot request {request_id[:15]} returned no data")
        
        # Legacy cleanup: Reset single waiter if it matches this request
        if self.session.hidden_screenshot_request_id == request_id:
            self.session.screenshot_waiter = None
            self.session.hidden_screenshot_request_id = None
    
    async def _handle_individual_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
        metadata: Dict[str, Any]
    ) -> None:
        """
        Handle individual tool result - stores result and resolves futures.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data
            error: Error message if execution failed
            metadata: Additional metadata
        """
        from backend.src.core.interfaces.tool import ToolResult
        
        # Convert frontend result to ToolResult format
        # Frontend pre-formats messages with system context XML and sets is_preformatted flag
        if isinstance(result_data, dict) and result_data.get("is_preformatted"):
            metadata["is_preformatted"] = True
        
        tool_result = ToolResult.from_dict({
            "success": success,
            "data": result_data,
            "error": error,
            "metadata": metadata,
        })
        
        # Extract screenshot data for logging and OCR
        screenshot_data = None
        if isinstance(tool_result.data, dict) and "screenshot" in tool_result.data:
            screenshot_data = tool_result.data["screenshot"]
            logger.debug("Tool result includes screenshot data")
        
        # Update screenshot and trigger OCR if present
        if screenshot_data:
            screenshot_id = self._generate_screenshot_id(screenshot_data)
            # MEMORY LEAK FIX: Add with LRU eviction
            self.session._store_screenshot_with_eviction(screenshot_id, screenshot_data)
            self.session._current_screenshot_id = screenshot_id
            await self._maybe_trigger_ocr(screenshot_data, screenshot_id, request_id)
        
        # Store the tool result in session for tool execution to pick up
        self.session._pending_tool_results[request_id] = tool_result
        
        # Resolve any waiting futures for this request_id
        if request_id in self.session._tool_result_futures:
            future = self.session._tool_result_futures.get(request_id)
            if future and not future.done():
                future.set_result(tool_result)
                logger.info(f"Resolved tool result future for request_id {request_id[:15]}")
    
    async def _handle_bundled_results(
        self,
        bundle_data: Dict[str, Any],
        bundle_request_id: str
    ) -> None:
        """
        Handle bundled tool results - stores individual results and creates combined result.
        
        Each tool result is pre-formatted with system context XML by the frontend.
        Individual results are stored for orchestrator matching, but a combined result
        is also created for single-message history storage.
        
        Args:
            bundle_data: The data dict from the bundle result (contains 'tools' array, 'combined_llm_content', and 'screenshot')
            bundle_request_id: The request_id of the bundle (for logging)
        """
        from backend.src.core.interfaces.tool import ToolResult
        
        tools = bundle_data.get("tools", [])
        bundle_screenshot = bundle_data.get("screenshot")
        combined_llm_content = bundle_data.get("combined_llm_content")
        
        logger.info(f"Processing bundle result: {len(tools)} tools, has_screenshot={bundle_screenshot is not None}, has_combined_content={combined_llm_content is not None}")
        
        # Process screenshot if present (update session and trigger OCR)
        if bundle_screenshot:
            screenshot_id = self._generate_screenshot_id(bundle_screenshot)
            # MEMORY LEAK FIX: Add with LRU eviction
            self.session._store_screenshot_with_eviction(screenshot_id, bundle_screenshot)
            self.session._current_screenshot_id = screenshot_id
            logger.debug("Bundle result includes screenshot data")
            await self._maybe_trigger_ocr(bundle_screenshot, screenshot_id, bundle_request_id)
        
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
                f"Storing bundled tool result for orchestrator: request_id={tool_request_id[:15]}, "
                f"tool={tool_name}, success={tool_success}"
            )
            
            # Store in pending results (for orchestrator to match by request_id)
            self.session._pending_tool_results[tool_request_id] = tool_result
            
            # Resolve waiting future for this tool's request_id
            if tool_request_id in self.session._tool_result_futures:
                future = self.session._tool_result_futures.get(tool_request_id)
                if future and not future.done():
                    future.set_result(tool_result)
                    logger.info(f"Resolved bundled tool result future for request_id {tool_request_id[:15]} (tool: {tool_name})")
                else:
                    logger.debug(f"Future for {tool_request_id[:15]} already done or missing")
            else:
                logger.debug(f"No waiting future for bundled tool request_id {tool_request_id[:15]}")
        
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
            self.session._bundled_results[bundle_request_id] = combined_result
            logger.info(f"Stored combined bundled result for history (bundle_id={bundle_request_id[:15]})")
        else:
            logger.warning(f"Bundle result missing combined_llm_content, cannot create combined history message")
        
        logger.info(f"Finished processing bundle result {bundle_request_id[:15]}")
    
    async def _maybe_trigger_ocr(
        self,
        screenshot_data: str,
        screenshot_id: str,
        request_id: str
    ) -> None:
        """
        Trigger proactive OCR if screenshot is present.
        
        NOTE: OCR triggering policy may evolve. If OCR rules change frequently,
        consider injecting an OcrPolicyService to decide when to trigger.
        For now, this remains a domain invariant (screenshot → trigger OCR).
        
        This is a non-blocking operation that runs OCR in the background.
        Tools that need OCR results will wait for ocr_completion_event.
        
        OCR results are stored keyed by screenshot_id to prevent race conditions.
        If a new screenshot arrives while OCR is processing, the old OCR task
        will complete but its results will be ignored (not overwriting new results).
        
        Args:
            screenshot_data: Base64-encoded screenshot data
            screenshot_id: Unique ID for this screenshot (for race condition prevention)
            request_id: Request ID for logging purposes
        """
        async def run_ocr_task():
            try:
                # Clear OCR completion event before starting new OCR
                self.session.ocr_completion_event.clear()
                
                # Get OCR plugin from session registry
                ocr_plugin = None
                if self.session.executor and self.session.executor.plugin_manager:
                    ocr_plugin = self.session.executor.plugin_manager.plugin_registry.get_plugin("ocr_analysis")
                
                if ocr_plugin and ocr_plugin.enabled:
                    # perform_ocr is now properly async and handles GPU cache management internally in a thread
                    results = await ocr_plugin.perform_ocr(screenshot_data)
                    if results:
                        # Only store results if this screenshot_id is still current
                        # This prevents race conditions where a new screenshot arrives
                        # while OCR is processing the old one
                        if self.session._current_screenshot_id == screenshot_id:
                            # MEMORY LEAK FIX: Store with LRU eviction
                            self.session._store_ocr_results_with_eviction(screenshot_id, results)
                            logger.info(f"Proactive OCR completed for screenshot {screenshot_id[:8]} (request {request_id[:15]})")
                        else:
                            logger.debug(f"OCR completed for outdated screenshot {screenshot_id[:8]}, ignoring results")
            except Exception as e:
                logger.error(f"Proactive OCR failed: {e}")
            finally:
                # Always set the event, even if OCR failed, to unblock waiting tools
                self.session.ocr_completion_event.set()
        
        asyncio.create_task(run_ocr_task())
    
    def _generate_screenshot_id(self, screenshot_data: str) -> str:
        """
        Generate a unique ID for a screenshot based on its content hash.
        
        Args:
            screenshot_data: Base64-encoded screenshot data
            
        Returns:
            Unique screenshot ID (SHA256 hash of first 1KB for performance)
        """
        # Use hash of first 1KB for performance (screenshots are large)
        # This is sufficient to uniquely identify different screenshots
        sample = screenshot_data[:1024] if len(screenshot_data) > 1024 else screenshot_data
        return hashlib.sha256(sample.encode('utf-8')).hexdigest()[:16]  # 16 chars is sufficient
