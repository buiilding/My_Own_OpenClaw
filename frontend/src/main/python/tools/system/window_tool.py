"""
Window Management Tool - Python implementation with platform abstraction.
"""

import asyncio
import logging
from typing import Dict, Any

from core.platform import WindowManager

logger = logging.getLogger(__name__)

# Global window manager instance
_window_manager = None


def _get_window_manager() -> WindowManager:
    """Get or create window manager instance."""
    global _window_manager
    if _window_manager is None:
        _window_manager = WindowManager()
    return _window_manager


async def switch_to_window(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Switch to a window by title.
    
    Args:
        args: Dictionary with 'tab_name'
        
    Returns:
        Dictionary with success status and switch result
    """
    tab_name = args.get("tab_name")
    
    if not tab_name:
        return {"success": False, "error": "tab_name is required"}
    
    try:
        def _switch():
            manager = _get_window_manager()
            success = manager.switch_to_window(tab_name)
            return success
        
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, _switch)
        
        if not success:
            return {
                "success": False,
                "error": f"Could not find or switch to window/tab with name: {tab_name}. Make sure the tab/window name matches exactly what appears in get_open_windows output.",
            }
        
        return {
            "success": True,
            "data": {
                "tab_name": tab_name,
                "llm_content": f"Successfully switched to tab '{tab_name}'",
                "return_display": f"Successfully switched to tab '{tab_name}'",
            },
        }
    except Exception as e:
        logger.error(f"Error switching to window: {e}", exc_info=True)
        return {"success": False, "error": f"Tab switching operation failed: {str(e)}"}


async def get_open_windows(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get list of open windows.
    
    Args:
        args: Dictionary with optional 'filter_text'
        
    Returns:
        Dictionary with success status and window list
    """
    filter_text = args.get("filter_text", "")
    
    try:
        def _get_windows():
            manager = _get_window_manager()
            windows = manager.get_windows()
            window_titles = [w["title"] for w in windows if w.get("title") and w["title"].strip()]
            
            # Apply filter if provided
            if filter_text:
                query = filter_text.lower()
                window_titles = [t for t in window_titles if query in t.lower()]
            
            return window_titles
        
        loop = asyncio.get_event_loop()
        window_titles = await loop.run_in_executor(None, _get_windows)
        
        content = "\n".join(f"- {w}" for w in window_titles) if window_titles else "No open windows found."
        
        return {
            "success": True,
            "data": {
                "windows": window_titles,
                "llm_content": content,
            },
        }
    except Exception as e:
        logger.error(f"Error getting open windows: {e}", exc_info=True)
        return {"success": False, "error": f"Failed to get open windows: {str(e)}"}
