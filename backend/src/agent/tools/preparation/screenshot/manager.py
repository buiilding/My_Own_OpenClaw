"""
Screenshot Manager.

Manages screenshot acquisition, processing, and the hidden screenshot workflow.
Handles async waiting, timeout logic, and centralized screenshot processing.
"""
import asyncio
import hashlib
import logging
import time
import uuid
from typing import TYPE_CHECKING, AsyncGenerator

from backend.src.agent.tools.shared.logging_utils import short_id
from backend.src.core.events import AgentStreamingEvent, RequestScreenshotEvent

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


class ScreenshotManager:
    """
    Manages screenshot acquisition for tool preparation.
    
    Responsibility: Screenshot availability and hidden screenshot workflow.
    Handles async waiting and timeout logic.
    """

    def __init__(self, timeout: float = 30.0):
        """
        Initialize the screenshot manager.
        
        Args:
            timeout: Timeout in seconds for waiting for hidden screenshot
        """
        self.timeout = timeout

    async def get_screenshot(
        self, session: "AgentSession"
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Get screenshot from session or request hidden screenshot if missing.
        
        Yields RequestScreenshotEvent if hidden screenshot is needed.
        Screenshot is stored in session with a unique ID to prevent race conditions.
        
        Args:
            session: Agent session with screenshot state
            
        Yields:
            RequestScreenshotEvent if hidden screenshot is requested (empty generator if screenshot exists)
            
        Raises:
            ValueError: If timeout waiting for hidden screenshot
        """
        # Check if we have a current screenshot
        current_screenshot_id = session._current_screenshot_id
        if current_screenshot_id:
            screenshot_data = session.get_screenshot(current_screenshot_id)
            if screenshot_data:
                # Screenshot already available - no events to yield
                return
        
        # Request hidden screenshot
        screenshot_wait_start = time.perf_counter()
        logger.info("No screenshot in session, requesting hidden screenshot...")
        
        hidden_request_id = str(uuid.uuid4())
        # SCREENSHOT REQUEST RACE FIX: Use request_id-based Future mapping to support
        # concurrent screenshot requests. Each request gets its own Future, preventing
        # race conditions where one request overwrites another's waiter.
        screenshot_future = asyncio.Future()
        session._pending_screenshots[hidden_request_id] = screenshot_future
        
        # Legacy support: Also set single waiter for backward compatibility
        session.hidden_screenshot_request_id = hidden_request_id
        session.screenshot_waiter = screenshot_future
        
        # Yield request event
        yield RequestScreenshotEvent(request_id=hidden_request_id)
        
        # Wait for result (with timeout)
        try:
            logger.info(f"Waiting for hidden screenshot result (id={short_id(hidden_request_id)})...")
            result = await asyncio.wait_for(
                screenshot_future, timeout=self.timeout
            )
            screenshot_wait_time = time.perf_counter() - screenshot_wait_start
            logger.info(f"[Timing] Hidden screenshot received in {screenshot_wait_time:.3f}s (id={short_id(hidden_request_id)})")
            
            # Result is now a tuple (screenshot_id, screenshot_data) from _handle_screenshot_waiter
            if isinstance(result, tuple) and len(result) == 2:
                screenshot_id, screenshot_data = result
                logger.info(f"Received hidden screenshot result (id={short_id(hidden_request_id)}, screenshot_id={screenshot_id[:8]})")
                # Screenshot is already stored in session by _handle_screenshot_waiter
            else:
                # Legacy format (just screenshot_data) - process it
                screenshot_data = result
                await self.process_screenshot(session, screenshot_data, hidden_request_id)
        except asyncio.TimeoutError:
            screenshot_wait_time = time.perf_counter() - screenshot_wait_start
            logger.error(f"[Timing] Hidden screenshot timeout after {screenshot_wait_time:.3f}s")
            logger.error(
                f"Timed out waiting for hidden screenshot (id={short_id(hidden_request_id)}) after {self.timeout}s"
            )
            # SCREENSHOT REQUEST RACE FIX: Clean up pending screenshot entry on timeout
            session._pending_screenshots.pop(hidden_request_id, None)
            # Legacy cleanup
            if session.hidden_screenshot_request_id == hidden_request_id:
                session.screenshot_waiter = None
                session.hidden_screenshot_request_id = None
            raise ValueError(
                f"Failed to acquire screenshot for coordinate resolution (timeout after {self.timeout}s)"
            )
    
    async def process_screenshot(
        self,
        session: "AgentSession",
        screenshot_data: str,
        request_id: str
    ) -> str:
        """
        Process a screenshot: store it as current (discarding old), and trigger OCR.
        
        SIMPLIFIED: Only current screenshot is kept. Previous screenshots are obsolete
        for desktop automation (can't interact with past state).
        
        This is the single source of truth for screenshot processing. All screenshots
        (from user messages, tool results, or hidden requests) go through this method.
        
        Args:
            session: Agent session to store screenshot in
            screenshot_data: Base64-encoded screenshot data
            request_id: Request ID for logging purposes
            
        Returns:
            screenshot_id: Unique ID for the screenshot
        """
        screenshot_id = self._generate_screenshot_id(screenshot_data)
        # SIMPLIFIED: Just set as current (discards old automatically)
        session.set_current_screenshot(screenshot_id, screenshot_data)
        logger.debug(f"Stored screenshot {screenshot_id[:8]} as current (request {short_id(request_id)})")
        
        # Trigger OCR in background (non-blocking)
        await self._maybe_trigger_ocr(session, screenshot_data, screenshot_id, request_id)
        
        return screenshot_id
    
    async def _maybe_trigger_ocr(
        self,
        session: "AgentSession",
        screenshot_data: str,
        screenshot_id: str,
        request_id: str
    ) -> None:
        """
        Trigger proactive OCR if screenshot is present.
        
        This is a non-blocking operation that runs OCR in the background.
        Tools that need OCR results will wait for ocr_completion_event.
        
        SIMPLIFIED: OCR results are stored for current screenshot only.
        If a new screenshot arrives while OCR is processing, the old OCR task
        will complete but its results will be ignored (screenshot_id won't match).
        
        Args:
            session: Agent session
            screenshot_data: Base64-encoded screenshot data
            screenshot_id: Unique ID for this screenshot (for race condition prevention)
            request_id: Request ID for logging purposes
        """
        async def run_ocr_task():
            try:
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
                        # Only store results if this screenshot_id is still current
                        # This prevents race conditions where a new screenshot arrives
                        # while OCR is processing the old one
                        if session._current_screenshot_id == screenshot_id:
                            session.set_current_ocr_results(results)
                            logger.info(f"Proactive OCR completed for screenshot {screenshot_id[:8]} (request {short_id(request_id)})")
                        else:
                            logger.debug(f"OCR completed for outdated screenshot {screenshot_id[:8]}, ignoring results")
            except Exception as e:
                logger.error(f"Proactive OCR failed: {e}")
            finally:
                # Always set the event, even if OCR failed, to unblock waiting tools
                session.ocr_completion_event.set()
        
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