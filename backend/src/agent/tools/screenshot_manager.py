"""
Screenshot Manager.

Manages screenshot acquisition and the hidden screenshot workflow.
Handles async waiting and timeout logic.
"""
import asyncio
import logging
import time
import uuid
from typing import TYPE_CHECKING, AsyncGenerator


def _short_id(request_id: str, length: int = 15) -> str:
    """Truncate request_id to specified length for logging."""
    return request_id[:length] if request_id else "unknown"

from backend.src.core.events import AgentStreamingEvent, RequestScreenshotEvent

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession

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
            logger.info(f"Waiting for hidden screenshot result (id={_short_id(hidden_request_id)})...")
            result = await asyncio.wait_for(
                screenshot_future, timeout=self.timeout
            )
            screenshot_wait_time = time.perf_counter() - screenshot_wait_start
            logger.info(f"[Timing] Hidden screenshot received in {screenshot_wait_time:.3f}s (id={_short_id(hidden_request_id)})")
            
            # Result is now a tuple (screenshot_id, screenshot_data) from _handle_screenshot_waiter
            if isinstance(result, tuple) and len(result) == 2:
                screenshot_id, screenshot_data = result
                logger.info(f"Received hidden screenshot result (id={_short_id(hidden_request_id)}, screenshot_id={screenshot_id[:8]})")
                # Screenshot is already stored in session by _handle_screenshot_waiter
            else:
                # Legacy format (just screenshot_data) - generate ID and store
                screenshot_data = result
                screenshot_id = session._generate_screenshot_id(screenshot_data)
                session._screenshots[screenshot_id] = screenshot_data
                session._current_screenshot_id = screenshot_id
                logger.info(f"Stored legacy screenshot with ID {screenshot_id[:8]}")
        except asyncio.TimeoutError:
            screenshot_wait_time = time.perf_counter() - screenshot_wait_start
            logger.error(f"[Timing] Hidden screenshot timeout after {screenshot_wait_time:.3f}s")
            logger.error(
                f"Timed out waiting for hidden screenshot (id={_short_id(hidden_request_id)}) after {self.timeout}s"
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
