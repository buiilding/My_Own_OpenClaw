"""
Screenshot and OCR state management for AgentSession.

Encapsulates screenshot and OCR state management logic to reduce
AgentSession complexity and improve modularity.
"""
from typing import Optional


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
    
    def get_screenshot(self, screenshot_id: Optional[str] = None) -> Optional[str]:
        """
        Get current screenshot data.
        
        SIMPLIFIED: Only current screenshot is stored. Previous screenshots are discarded.
        screenshot_id parameter is ignored (kept for API compatibility).
        
        Args:
            screenshot_id: Ignored (kept for backward compatibility)
            
        Returns:
            Base64-encoded screenshot data or None if no current screenshot
        """
        return self._current_screenshot
    
    def get_ocr_results(self, screenshot_id: Optional[str] = None) -> Optional[list[dict]]:
        """
        Get OCR results for current screenshot.
        
        SIMPLIFIED: Only current OCR results are stored. Previous results are discarded.
        screenshot_id parameter is ignored (kept for API compatibility).
        
        Args:
            screenshot_id: Ignored (kept for backward compatibility)
            
        Returns:
            List of OCR results or None if no current OCR results
        """
        return self._current_ocr_results
    
    @property
    def latest_screenshot(self) -> Optional[str]:
        """Legacy property: Returns current screenshot (deprecated, use get_screenshot instead)."""
        return self.get_screenshot()
    
    @property
    def latest_ocr_results(self) -> Optional[list[dict]]:
        """Legacy property: Returns OCR for current screenshot (deprecated, use get_ocr_results instead)."""
        return self.get_ocr_results()
    
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
