"""
Window Management Tool - Python implementation with platform abstraction.
"""

import asyncio
import logging
import re
import time
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
                return False, None, None
            success = manager.switch_to_window(target_title)
            if not success:
                return False, target_title, _get_active_window_title(manager)

            verified = _verify_window_switch(
                manager,
                target_title,
            )
            active_window_title = _get_active_window_title(manager)
            return verified, target_title, active_window_title
        
        loop = asyncio.get_event_loop()
        success, resolved_title, active_window_title = await loop.run_in_executor(
            get_interactive_executor(),
            _switch,
        )
        
        if not success:
            active_window_suffix = (
                f" Active window after switch attempt: '{active_window_title}'."
                if isinstance(active_window_title, str) and active_window_title.strip()
                else ""
            )
            return {
                "success": False,
                "error": (
                    f"Could not find or switch to window/tab with name: {tab_name}. "
                    "Use the full window title from get_open_windows output for best results."
                    f"{active_window_suffix}"
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


def _normalize_title(title: str | None) -> str:
    if not isinstance(title, str):
        return ""
    return " ".join(title.strip().split()).casefold()


def _titles_match(expected_title: str, active_title: str | None) -> bool:
    normalized_expected = _normalize_title(expected_title)
    normalized_active = _normalize_title(active_title)
    if not normalized_expected or not normalized_active:
        return False
    return (
        normalized_expected == normalized_active
        or normalized_expected in normalized_active
        or normalized_active in normalized_expected
    )


def _get_active_window_title(manager: WindowManager) -> str | None:
    active_window = manager.get_active_window()
    if not isinstance(active_window, dict):
        return None
    title = active_window.get("title")
    return title if isinstance(title, str) and title.strip() else None


def _verify_window_switch(
    manager: WindowManager,
    expected_title: str,
    *,
    attempts: int = 10,
    delay_seconds: float = 0.1,
) -> bool:
    for _ in range(max(1, attempts)):
        active_title = _get_active_window_title(manager)
        if _titles_match(expected_title, active_title):
            return True
        time.sleep(max(0.0, delay_seconds))
    return False
