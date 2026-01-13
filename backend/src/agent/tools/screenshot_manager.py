"""
Screenshot Manager.

Manages screenshot acquisition and the hidden screenshot workflow.
Handles async waiting and timeout logic.
"""
import asyncio
import logging
import uuid
from typing import TYPE_CHECKING, AsyncGenerator, Optional

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
        Sets session.latest_screenshot when screenshot is received.
        
        Args:
            session: Agent session with screenshot state
            
        Yields:
            RequestScreenshotEvent if hidden screenshot is requested (empty generator if screenshot exists)
            
        Raises:
            ValueError: If timeout waiting for hidden screenshot
        """
        screenshot_data = session.latest_screenshot
        
        if screenshot_data:
            # Screenshot already available - no events to yield
            return
        
        # Request hidden screenshot
        logger.info("No screenshot in session, requesting hidden screenshot...")
        
        hidden_request_id = str(uuid.uuid4())
        session.hidden_screenshot_request_id = hidden_request_id
        session.screenshot_waiter = asyncio.Future()
        
        # Yield request event
        yield RequestScreenshotEvent(request_id=hidden_request_id)
        
        # Wait for result (with timeout)
        try:
            logger.info(f"Waiting for hidden screenshot result (id={hidden_request_id})...")
            screenshot_data = await asyncio.wait_for(
                session.screenshot_waiter, timeout=self.timeout
            )
            logger.info(f"Received hidden screenshot result (id={hidden_request_id})")
            # Update session with received screenshot
            session.latest_screenshot = screenshot_data
        except asyncio.TimeoutError:
            logger.error(
                f"Timed out waiting for hidden screenshot (id={hidden_request_id}) after {self.timeout}s"
            )
            raise ValueError(
                f"Failed to acquire screenshot for coordinate resolution (timeout after {self.timeout}s)"
            )
