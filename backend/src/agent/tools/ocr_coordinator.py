"""
OCR Coordinator.

Coordinates OCR result acquisition and waiting for proactive OCR.
Handles OCR plugin access and synchronization.
"""
import asyncio
import logging
import time
from typing import List, Dict, Any, TYPE_CHECKING

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
        self, session: "AgentSession", screenshot_data: str
    ) -> List[Dict[str, Any]]:
        """
        Get OCR results, waiting for proactive OCR if needed.
        
        Args:
            session: Agent session with OCR state
            screenshot_data: Base64-encoded screenshot (for fallback OCR)
            
        Returns:
            List of OCR results with text and bbox
            
        Raises:
            ValueError: If OCR plugin unavailable or OCR fails
        """
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
            logger.info("Waiting for proactive OCR to complete...")
            await session.ocr_completion_event.wait()
            ocr_wait_time = time.perf_counter() - ocr_wait_start
            logger.info(f"[Timing] Proactive OCR wait completed in {ocr_wait_time:.3f}s")
            logger.info("Proactive OCR completed, proceeding with coordinate resolution")

        # Get OCR results (use cached if available, otherwise run it)
        ocr_results = session.latest_ocr_results

        # If no results yet (proactive OCR disabled or failed), run it now
        if not ocr_results:
            logger.info("OCR results not cached, running OCR now...")
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
            session.latest_ocr_results = ocr_results

        if not ocr_results:
            raise ValueError("OCR analysis returned no results")

        return ocr_results
