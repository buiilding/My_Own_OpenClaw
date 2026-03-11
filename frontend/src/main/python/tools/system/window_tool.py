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


def _get_window_display_name(window: Dict[str, Any]) -> str:
    app_name = str(window.get("app_name") or "").strip()
    title = str(window.get("title") or "").strip()

    if app_name and title and title.lower() != app_name.lower():
        return f"{app_name}: {title}"
    if app_name:
        return app_name
    return title


def _collect_window_display_names(
    windows: list[dict],
    *,
    filter_text: str = "",
) -> list[str]:
    query = str(filter_text or "").strip().lower()
    display_names: list[str] = []
    seen: set[str] = set()

    for window in windows:
        display_name = _get_window_display_name(window)
        if not display_name:
            continue
        if query:
            candidate_text = " ".join(
                value
                for value in (
                    display_name,
                    str(window.get("app_name") or "").strip(),
                    str(window.get("title") or "").strip(),
                )
                if value
            ).lower()
            if query not in candidate_text:
                continue
        normalized_name = display_name.lower()
        if normalized_name in seen:
            continue
        seen.add(normalized_name)
        display_names.append(display_name)

    return display_names


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
                    "Use the app/window name from get_open_windows output for best results."
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
            return _collect_window_display_names(windows, filter_text=filter_text)
        
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
    candidates: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for window in windows:
        switch_target = (
            str(window.get("title") or "").strip()
            or str(window.get("app_name") or "").strip()
        )
        if not switch_target:
            continue
        for candidate in (
            (str(window.get("app_name") or "").strip(), str(window.get("app_name") or "").strip()),
            (str(window.get("title") or "").strip(), str(window.get("title") or "").strip()),
            (_get_window_display_name(window), switch_target),
        ):
            candidate_label, candidate_target = candidate
            if not candidate_label or not candidate_target:
                continue
            normalized_candidate = (candidate_label.lower(), candidate_target.lower())
            if normalized_candidate in seen:
                continue
            seen.add(normalized_candidate)
            candidates.append((candidate_label, candidate_target))

    query = tab_name.strip()
    if not query:
        return None

    normalized_mode = str(match_mode or "exact").strip().lower()
    if normalized_mode == "contains":
        query_lower = query.lower()
        for candidate_label, candidate_target in candidates:
            if query_lower in candidate_label.lower():
                return candidate_target
        return None

    if normalized_mode == "regex":
        pattern = re.compile(query, re.IGNORECASE)
        for candidate_label, candidate_target in candidates:
            if pattern.search(candidate_label):
                return candidate_target
        return None

    for candidate_label, candidate_target in candidates:
        if candidate_label.lower() == query.lower():
            return candidate_target
    return None
