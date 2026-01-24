"""
Screenshot processor.

Processes screenshots from tool results (stores, triggers OCR).
"""
import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.screenshot.manager import ScreenshotManager

logger = logging.getLogger(__name__)


class ScreenshotProcessor:
    """
    Processes screenshots from tool results.
    
    Responsibility: Screenshot processing from results only.
    Delegates to ScreenshotManager for actual processing.
    """

    def __init__(
        self,
        screenshot_manager: "ScreenshotManager",
    ):
        """
        Initialize the screenshot processor.
        
        Args:
            screenshot_manager: Manager for screenshot processing
        """
        self.screenshot_manager = screenshot_manager

    async def process_from_result(
        self,
        session: "AgentSession",
        screenshot_data: str,
        context_id: str,
    ) -> Optional[str]:
        """
        Process screenshot from tool result.
        
        Stores screenshot as current, triggers OCR processing.
        
        Args:
            session: Agent session for state
            screenshot_data: Base64-encoded screenshot data
            context_id: Context ID (request_id or bundle_id) for logging
            
        Returns:
            Screenshot ID if processing succeeded, None otherwise
        """
        try:
            screenshot_id = await self.screenshot_manager.process_screenshot(
                session, screenshot_data, context_id
            )
            return screenshot_id
        except Exception as e:
            logger.error(f"Failed to process screenshot from result (context_id={context_id[:15]}): {e}", exc_info=True)
            return None
