"""macOS window manager implementation."""

import logging
from typing import List, Optional

from .base import BaseWindowManager

logger = logging.getLogger(__name__)


class MacOSWindowManager(BaseWindowManager):
    """macOS-specific window management using AppKit."""
    
    def __init__(self):
        try:
            from AppKit import NSWorkspace
            self.NSWorkspace = NSWorkspace
            self._available = True
        except Exception:
            logger.warning("AppKit not available, window management disabled on macOS")
            self._available = False
    
    def get_windows(self) -> List[dict]:
        """Get list of all open windows."""
        if not self._available:
            return []
        
        windows = []
        try:
            workspace = self.NSWorkspace.sharedWorkspace()
            running_apps = workspace.runningApplications()
            
            for app in running_apps:
                app_name = app.localizedName()
                if app_name:
                    windows.append({"title": app_name, "hwnd": None})  # macOS doesn't use hwnd
        except Exception as e:
            logger.error(f"Error getting windows: {e}", exc_info=True)
        
        return windows
    
    def get_active_window(self) -> Optional[dict]:
        """Get active window."""
        if not self._available:
            return None
        
        try:
            workspace = self.NSWorkspace.sharedWorkspace()
            app = workspace.activeApplication()
            app_name = app.get("NSApplicationName")
            if app_name:
                return {"title": app_name, "hwnd": None}
        except Exception as e:
            logger.error(f"Error getting active window: {e}", exc_info=True)
        
        return None
    
    def switch_to_window(self, window_title: str) -> bool:
        """Switch to a window by title."""
        if not self._available:
            return False
        
        try:
            workspace = self.NSWorkspace.sharedWorkspace()
            running_apps = workspace.runningApplications()
            
            for app in running_apps:
                app_name = app.localizedName()
                if app_name and window_title.lower() in app_name.lower():
                    app.activateWithOptions_(0)  # Activate the application
                    return True
        except Exception as e:
            logger.error(f"Error switching to window: {e}", exc_info=True)
        
        return False
