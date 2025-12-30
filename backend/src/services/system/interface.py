"""
System Interface for platform-agnostic system operations.

Abstract base class defining the interface for system operations
that vary by platform (Linux, Windows, macOS).
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple, Any


class SystemInterface(ABC):
    """
    Abstract interface for system operations.
    
    Provides a unified interface for platform-specific system operations,
    eliminating scattered platform.system() checks throughout the codebase.
    """
    
    @abstractmethod
    def get_active_window(self) -> str:
        """
        Get the title of the currently focused window.
        
        Returns:
            Window title string, or "Unknown Window" if unable to determine
        """
        pass
    
    @abstractmethod
    def get_open_windows(self) -> List[str]:
        """
        Get list of all open window titles.
        
        Returns:
            List of window title strings
        """
        pass
    
    @abstractmethod
    def switch_to_window(self, window_title: str) -> bool:
        """
        Switch focus to a window with the given title.

        Args:
            window_title: Exact or partial window title to switch to

        Returns:
            True if window was found and activated, False otherwise
        """
        pass
    
    @abstractmethod
    def get_mouse_position(self) -> Tuple[int, int]:
        """
        Get current mouse coordinates.
        
        Returns:
            Tuple of (x, y) coordinates
        """
        pass
    
    @abstractmethod
    def get_clipboard_preview(self, max_length: int = 100) -> str:
        """
        Get truncated clipboard content.
        
        Args:
            max_length: Maximum length of preview
            
        Returns:
            Clipboard content preview string
        """
        pass
    
    @abstractmethod
    def get_screen_resolution(self) -> str:
        """
        Get current screen resolution.
        
        Returns:
            Resolution string in format "widthxheight"
        """
        pass
    
    @abstractmethod
    def get_system_time(self) -> str:
        """
        Get current formatted system time.
        
        Returns:
            Formatted time string
        """
        pass
    
    @abstractmethod
    def check_internet(self) -> str:
        """
        Check internet connectivity.
        
        Returns:
            "Online" or "Offline"
        """
        pass
    
    @abstractmethod
    def get_system_stats(self) -> Dict[str, Any]:
        """
        Get system resource usage statistics.
        
        Returns:
            Dictionary with cpu_percent, memory_percent, battery_percent, battery_charging
        """
        pass

