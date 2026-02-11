"""
Screenshot Manager.

Manages screenshot acquisition and processing.
Centralizes storage of the active screenshot and OCR triggering.
"""
import asyncio
import hashlib
import logging
from typing import TYPE_CHECKING, Any

from backend.src.agent.tools.shared.logging_utils import short_id

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


class ScreenshotManager:
    """
    Manages screenshot acquisition for tool preparation.
    
    Responsibility: Screenshot availability for coordinate resolution.
    """

    def __init__(self, timeout: float = 30.0):
        """
        Initialize the screenshot manager.
        
        Args:
            timeout: Reserved for future use
        """
        self.timeout = timeout

    async def ensure_screenshot(self, session: "AgentSession") -> None:
        """
        Ensure an active screenshot is available in session.

        Raises:
            ValueError: If no active screenshot is available
        """
        current_screenshot_id = session.get_current_screenshot_id()
        if current_screenshot_id:
            screenshot_data = session.get_screenshot()
            if screenshot_data:
                return

        raise ValueError("No active screenshot available for coordinate resolution")

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
        (from user messages or tool results) go through this method.
        
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
        ocr_service = session.ocr_service
        if not ocr_service or not ocr_service.enabled:
            # OCR disabled: keep event set so tools don't block unnecessarily.
            session.ocr_completion_event.set()
            self._cancel_active_ocr_task(session)
            return

        async def run_ocr_task():
            try:
                # Clear OCR completion event before starting new OCR
                session.ocr_completion_event.clear()

                # perform_ocr is async and handles GPU cache management internally in a thread
                results = await ocr_service.perform_ocr(screenshot_data)
                if results:
                    # Only store results if this screenshot_id is still current
                    # This prevents race conditions where a new screenshot arrives
                    # while OCR is processing the old one
                    if session.get_current_screenshot_id() == screenshot_id:
                        session.set_current_ocr_results(results)
                        logger.info(f"Proactive OCR completed for screenshot {screenshot_id[:8]} (request {short_id(request_id)})")
                    else:
                        logger.debug(f"OCR completed for outdated screenshot {screenshot_id[:8]}, ignoring results")
            except Exception as e:
                logger.error(f"Proactive OCR failed: {e}")
            finally:
                # Always set the event, even if OCR failed, to unblock waiting tools
                session.ocr_completion_event.set()
                current_task = asyncio.current_task()
                if current_task is not None:
                    self._clear_active_ocr_task(session, current_task)

        # Cancel stale OCR task before scheduling next one.
        self._cancel_active_ocr_task(session)
        task: asyncio.Task[Any] = asyncio.create_task(run_ocr_task())
        self._set_active_ocr_task(session, task, screenshot_id)
    
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

    @staticmethod
    def _cancel_active_ocr_task(session: "AgentSession") -> None:
        cancel = getattr(session, "cancel_active_ocr_task", None)
        if callable(cancel):
            cancel()

    @staticmethod
    def _set_active_ocr_task(
        session: "AgentSession",
        task: asyncio.Task[Any],
        screenshot_id: str,
    ) -> None:
        setter = getattr(session, "set_active_ocr_task", None)
        if callable(setter):
            setter(task, screenshot_id)

    @staticmethod
    def _clear_active_ocr_task(
        session: "AgentSession",
        task: asyncio.Task[Any],
    ) -> None:
        clearer = getattr(session, "clear_active_ocr_task", None)
        if callable(clearer):
            clearer(task)
