"""
Screenshot and OCR state management for AgentSession.

Encapsulates screenshot and OCR state management logic to reduce
AgentSession complexity and improve modularity.
"""
import asyncio
from typing import Any, Optional


class ScreenshotState:
    """
    Manages screenshot and OCR state for a session.
    
    SIMPLIFIED: Only keeps current screenshot and OCR results.
    Previous screenshots are obsolete for desktop automation.
    """
    
    def __init__(self):
        """Initialize empty screenshot state."""
        self._current_screenshot: Optional[str] = None  # Base64-encoded screenshot data
        self._current_screenshot_id: Optional[str] = None  # ID of the current screenshot
        self._current_ocr_results: Optional[list[dict]] = None  # OCR results for current screenshot
        self._active_ocr_task: Optional[asyncio.Task[Any]] = None
        self._active_ocr_task_screenshot_id: Optional[str] = None
    
    def get_screenshot(self) -> Optional[str]:
        """
        Get current screenshot data.
        """
        return self._current_screenshot

    def get_ocr_results(self) -> Optional[list[dict]]:
        """
        Get OCR results for current screenshot.
        """
        return self._current_ocr_results

    def get_current_screenshot_id(self) -> Optional[str]:
        """
        Get the ID of the current screenshot.
        
        ENCAPSULATION: Public method to access current screenshot ID without
        exposing private implementation details.
        
        Returns:
            Current screenshot ID or None if no screenshot is available
        """
        return self._current_screenshot_id
    
    def set_current_screenshot(self, screenshot_id: str, screenshot_data: str) -> None:
        """
        Set the current screenshot, discarding any previous screenshot.
        
        SIMPLIFIED: Only current screenshot is kept. Previous screenshots are obsolete
        for desktop automation (can't interact with past state).
        
        Args:
            screenshot_id: Unique ID for the screenshot
            screenshot_data: Base64-encoded screenshot data
        """
        self._current_screenshot = screenshot_data
        self._current_screenshot_id = screenshot_id
        # Discard old OCR results when screenshot changes
        self._current_ocr_results = None
    
    def set_current_ocr_results(self, ocr_results: list[dict]) -> None:
        """
        Set OCR results for the current screenshot.
        
        Args:
            ocr_results: List of OCR results
        """
        self._current_ocr_results = ocr_results

    def set_active_ocr_task(
        self,
        task: asyncio.Task[Any],
        screenshot_id: str,
    ) -> None:
        """Track the currently running OCR task and its source screenshot ID."""
        self._active_ocr_task = task
        self._active_ocr_task_screenshot_id = screenshot_id

    def get_active_ocr_task(
        self,
        screenshot_id: Optional[str] = None,
    ) -> Optional[asyncio.Task[Any]]:
        """
        Get active OCR task.

        If screenshot_id is provided, only return task when it matches.
        """
        if self._active_ocr_task is None:
            return None
        if screenshot_id is not None and self._active_ocr_task_screenshot_id != screenshot_id:
            return None
        return self._active_ocr_task

    def clear_active_ocr_task(
        self,
        task: Optional[asyncio.Task[Any]] = None,
    ) -> None:
        """Clear tracked OCR task when it matches, or always when no task is provided."""
        if task is not None and task is not self._active_ocr_task:
            return
        self._active_ocr_task = None
        self._active_ocr_task_screenshot_id = None

    def cancel_active_ocr_task(self) -> bool:
        """Cancel tracked OCR task if it is still running."""
        task = self._active_ocr_task
        if task is None:
            return False
        if not task.done():
            task.cancel()
        self.clear_active_ocr_task(task)
        return True

    def clear(self) -> None:
        """Clear all screenshot/OCR state for session shutdown."""
        self.cancel_active_ocr_task()
        self._current_screenshot = None
        self._current_screenshot_id = None
        self._current_ocr_results = None
