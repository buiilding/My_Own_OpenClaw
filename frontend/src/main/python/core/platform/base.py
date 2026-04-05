"""Base window manager interface."""

from abc import ABC, abstractmethod
from typing import List, Optional


class BaseWindowManager(ABC):
    """Abstract base class for window management."""
    
    @abstractmethod
    def get_windows(self) -> List[dict]:
        """
        Get list of all open windows.
        
        Returns:
            List of window dictionaries with 'title' and 'hwnd' keys
        """
        pass
    
    @abstractmethod
    def get_active_window(self) -> Optional[dict]:
        """
        Get active window.
        
        Returns:
            Window dictionary with 'title' and 'hwnd' keys, or None
        """
        pass
    
    @abstractmethod
    def switch_to_window(self, window_target: str | dict) -> bool:
        """
        Switch to a window by title or a resolved window record.
        
        Args:
            window_target: Window title or resolved window record to switch to
            
        Returns:
            True if successful, False otherwise
        """
        pass
