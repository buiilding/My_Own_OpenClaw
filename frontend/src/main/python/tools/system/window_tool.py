"""
Window Management Tool - Python implementation with platform abstraction.
"""

import asyncio
import logging
import re
from typing import Dict, Any

from core.executors import get_interactive_executor
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
    match_mode = args.get("match_mode", "exact")
    
    if not tab_name:
        return {"success": False, "error": "tab_name is required"}
    
    try:
        def _switch():
            manager = _get_window_manager()
            windows = manager.get_windows()
            target_title = _resolve_target_title(windows, tab_name, match_mode)
            if not target_title:
                return False, None
            success = manager.switch_to_window(target_title)
            return success, target_title
        
        loop = asyncio.get_event_loop()
        success, resolved_title = await loop.run_in_executor(get_interactive_executor(), _switch)
        
        if not success:
            return {
                "success": False,
                "error": (
                    f"Could not find or switch to window/tab with name: {tab_name}. "
                    "Use the full window title from get_open_windows output for best results."
                ),
            }
        
        return {
            "success": True,
            "data": {
                "tab_name": resolved_title,
                "llm_content": f"Successfully switched to tab '{resolved_title}'",
                "return_display": f"Successfully switched to tab '{resolved_title}'",
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
        window_titles = await loop.run_in_executor(get_interactive_executor(), _get_windows)
        
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


def _resolve_target_title(windows: list[dict], tab_name: str, match_mode: str) -> str | None:
    titles = [window["title"] for window in windows if window.get("title")]
    query = tab_name.strip()
    if not query:
        return None

    normalized_mode = str(match_mode or "exact").strip().lower()
    if normalized_mode == "contains":
        query_lower = query.lower()
        for title in titles:
            if query_lower in title.lower():
                return title
        return None

    if normalized_mode == "regex":
        pattern = re.compile(query, re.IGNORECASE)
        for title in titles:
            if pattern.search(title):
                return title
        return None

    for title in titles:
        if title.lower() == query.lower():
            return title
    return None
