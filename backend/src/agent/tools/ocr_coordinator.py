"""
OCR Coordinator.

Coordinates OCR result acquisition and waiting for proactive OCR.
Handles OCR plugin access and synchronization.
"""
import asyncio
import logging
import time
from typing import List, Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession

logger = logging.getLogger(__name__)


class OcrCoordinator:
    """
    Coordinates OCR result acquisition.
    
    Responsibility: OCR synchronization and plugin access.
    Handles waiting for proactive OCR and fallback OCR execution.
    """

    async def get_ocr_results(
        self, session: "AgentSession", screenshot_data: str, screenshot_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get OCR results, waiting for proactive OCR if needed.
        
        Verifies that OCR results match the specific screenshot being used to prevent
        race conditions where OCR results from a different screenshot are returned.
        
        Args:
            session: Agent session with OCR state
            screenshot_data: Base64-encoded screenshot (for fallback OCR)
            screenshot_id: Optional screenshot ID. If provided, verifies OCR results match this screenshot.
                          If None, uses current screenshot ID.
            
        Returns:
            List of OCR results with text and bbox
            
        Raises:
            ValueError: If OCR plugin unavailable, OCR fails, or screenshot ID mismatch
        """
        # Determine which screenshot_id to use
        if screenshot_id is None:
            screenshot_id = session._current_screenshot_id
        
        # Wait for proactive OCR to complete if it's still running
        # This ensures we use the latest OCR results from the current screenshot
        # Proactive OCR is triggered automatically by ToolResultHandler when screenshots arrive
        ocr_wait_start = time.perf_counter()
        if not hasattr(session, "ocr_completion_event") or session.ocr_completion_event is None:
            session.ocr_completion_event = asyncio.Event()
            session.ocr_completion_event.set()  # Set it (no OCR in progress initially)
        else:
            # Event exists - wait for it (OCR might be in progress)
            # This is the synchronization point: we wait here until proactive OCR completes
            # PROACTIVE OCR DEADLOCK FIX: Add timeout to prevent infinite hang if OCR worker fails
            logger.info("Waiting for proactive OCR to complete...")
            try:
                # Wait up to 5 seconds for proactive OCR
                # If timeout expires, fall through to on-demand OCR
                await asyncio.wait_for(session.ocr_completion_event.wait(), timeout=5.0)
                ocr_wait_time = time.perf_counter() - ocr_wait_start
                logger.info(f"[Timing] Proactive OCR wait completed in {ocr_wait_time:.3f}s")
                logger.info("Proactive OCR completed, proceeding with coordinate resolution")
            except asyncio.TimeoutError:
                ocr_wait_time = time.perf_counter() - ocr_wait_start
                logger.warning(
                    f"[Timing] Proactive OCR wait timed out after {ocr_wait_time:.3f}s. "
                    f"OCR worker may have failed. Falling back to on-demand OCR."
                )
                # Event not set - OCR worker likely failed or crashed
                # Fall through to on-demand OCR below

        # SIMPLIFIED: Get OCR results for current screenshot only
        # Verify screenshot_id matches current screenshot (if provided)
        if screenshot_id and session._current_screenshot_id != screenshot_id:
            logger.warning(
                f"Screenshot ID mismatch: requested {screenshot_id[:8]}, "
                f"current is {session._current_screenshot_id[:8] if session._current_screenshot_id else 'None'}. "
                f"OCR results may be stale."
            )
            # Screenshot changed - clear results and re-run OCR
            ocr_results = None
        else:
            # Get OCR results for current screenshot
            ocr_results = session.get_ocr_results()
            if ocr_results:
                logger.info(f"Using cached OCR results for current screenshot {session._current_screenshot_id[:8] if session._current_screenshot_id else 'unknown'}")

        # If no results yet (proactive OCR disabled, failed, or screenshot changed), run it now
        if not ocr_results:
            logger.info("OCR results not cached for current screenshot, running OCR now...")
            ocr_exec_start = time.perf_counter()

            ocr_plugin = None
            if session.executor and session.executor.plugin_manager:
                ocr_plugin = (
                    session.executor.plugin_manager.plugin_registry.get_plugin(
                        "ocr_analysis"
                    )
                )

            if not ocr_plugin or not ocr_plugin.enabled:
                raise ValueError("OCR plugin is not available or enabled")

            ocr_results = await ocr_plugin.perform_ocr(screenshot_data)
            ocr_exec_time = time.perf_counter() - ocr_exec_start
            logger.info(f"[Timing] OCR execution took {ocr_exec_time:.3f}s (found {len(ocr_results) if ocr_results else 0} results)")
            
            # SIMPLIFIED: Store results for current screenshot only
            session.set_current_ocr_results(ocr_results)

        if not ocr_results:
            raise ValueError("OCR analysis returned no results")

        return ocr_results
