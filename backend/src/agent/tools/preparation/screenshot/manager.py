"""
Screenshot Manager.

Manages screenshot acquisition and processing.
Centralizes storage of the active screenshot and OCR triggering.
"""

import asyncio
import hashlib
import logging
from typing import TYPE_CHECKING, Any, Optional

from backend.src.agent.tools.shared.logging_utils import short_id

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)

NO_ACTIVE_GROUNDING_FRAME_ERROR = "No active grounding frame"


class ScreenshotManager:
    """
    Manages screenshot acquisition for tool preparation.

    Responsibility: Screenshot availability for coordinate resolution.
    """

    async def ensure_screenshot(self, session: "AgentSession") -> None:
        """
        Ensure an active screenshot is available in session.

        Raises:
            ValueError: If no active screenshot is available
        """
        ocr_state = session.get_ocr_runtime_state()
        current_screenshot_id = ocr_state.get_current_screenshot_id()
        if current_screenshot_id:
            screenshot_data = session.get_screenshot()
            if screenshot_data:
                return

        raise ValueError(NO_ACTIVE_GROUNDING_FRAME_ERROR)

    async def process_screenshot(
        self,
        session: "AgentSession",
        screenshot_data: str,
        request_id: str,
        *,
        capture_meta: Optional[dict] = None,
    ) -> str:
        """
        Process a screenshot: store it as current and trigger OCR.

        This is the single source of truth for screenshot processing. All screenshots
        (from user messages or tool results) go through this method.

        Args:
            session: Agent session to store screenshot in
            screenshot_data: Base64-encoded screenshot data
            request_id: Request ID for logging purposes

        Returns:
            screenshot_id: Unique ID for the screenshot
        """
        normalized_screenshot_id = self._generate_screenshot_id(screenshot_data)
        session.set_current_screenshot(
            normalized_screenshot_id,
            screenshot_data,
            capture_meta=capture_meta,
        )
        logger.debug(
            "Stored screenshot %s as current (request %s)",
            normalized_screenshot_id[:8],
            short_id(request_id),
        )

        # Trigger OCR in background (non-blocking)
        await self._maybe_trigger_ocr(
            session,
            screenshot_data,
            normalized_screenshot_id,
            request_id,
        )

        return normalized_screenshot_id

    async def _maybe_trigger_ocr(
        self,
        session: "AgentSession",
        screenshot_data: str,
        screenshot_id: str,
        request_id: str,
    ) -> None:
        """
        Trigger proactive OCR if screenshot is present.

        This is a non-blocking operation that runs OCR in the background.
        Tools that need OCR results will wait for ocr_completion_event.

        OCR results are stored for the current screenshot only.
        If a new screenshot arrives while OCR is processing, the old OCR task
        will complete but its results will be ignored (screenshot_id won't match).

        Args:
            session: Agent session
            screenshot_data: Base64-encoded screenshot data
            screenshot_id: Unique ID for this screenshot (for race condition prevention)
            request_id: Request ID for logging purposes
        """
        ocr_service = getattr(session, "ocr_router", None)
        ocr_state = session.get_ocr_runtime_state()
        if not ocr_service or not ocr_service.enabled:
            # OCR disabled: keep event set so tools don't block unnecessarily.
            ocr_state.cancel_active_task()
            session.ocr_completion_event.set()
            return

        async def run_ocr_task():
            try:
                # perform_ocr is async and handles GPU cache management internally in a thread
                results = await ocr_service.perform_ocr(screenshot_data)
                if results:
                    # Only store results if this screenshot_id is still current
                    # This prevents race conditions where a new screenshot arrives
                    # while OCR is processing the old one
                    if ocr_state.get_current_screenshot_id() == screenshot_id:
                        ocr_state.set_results(results)
                        logger.info(
                            f"Proactive OCR completed for screenshot {screenshot_id[:8]} (request {short_id(request_id)})"
                        )
                    else:
                        logger.debug(
                            f"OCR completed for outdated screenshot {screenshot_id[:8]}, ignoring results"
                        )
            except Exception as e:
                logger.error(f"Proactive OCR failed: {e}")
            finally:
                # Only the active OCR task for the current screenshot may mark
                # OCR readiness. Canceled stale tasks must not unblock waiters
                # for a newer screenshot that shares the same session event.
                current_task = asyncio.current_task()
                if (
                    current_task is not None
                    and ocr_state.get_active_task(screenshot_id) is current_task
                ):
                    session.ocr_completion_event.set()
                if current_task is not None:
                    ocr_state.clear_active_task(current_task)

        # Cancel stale OCR task before scheduling next one.
        ocr_state.cancel_active_task()
        session.ocr_completion_event.clear()
        task: asyncio.Task[Any] = asyncio.create_task(run_ocr_task())
        ocr_state.set_active_task(task, screenshot_id)

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
        sample = (
            screenshot_data[:1024] if len(screenshot_data) > 1024 else screenshot_data
        )
        return hashlib.sha256(sample.encode("utf-8")).hexdigest()[
            :16
        ]  # 16 chars is sufficient
