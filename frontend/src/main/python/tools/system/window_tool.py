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

_SWITCH_DUPLICATE_INDEX_KEY = "_switch_duplicate_index"
_SWITCH_DUPLICATE_TOTAL_KEY = "_switch_duplicate_total"
_SWITCH_DISPLAY_LABEL_KEY = "_switch_display_label"

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


def _get_window_switch_target(window: Dict[str, Any]) -> str:
    return (
        str(window.get("title") or "").strip()
        or str(window.get("app_name") or "").strip()
    )


def _collect_window_display_entries(
    windows: list[dict],
    *,
    filter_text: str = "",
) -> list[dict[str, Any]]:
    query = str(filter_text or "").strip().lower()
    entries: list[dict[str, Any]] = []

    for window in windows:
        display_name = _get_window_display_name(window)
        app_name = str(window.get("app_name") or "").strip()
        title = str(window.get("title") or "").strip()
        switch_target = _get_window_switch_target(window)
        if not display_name or not switch_target:
            continue
        if query:
            candidate_text = " ".join(
                value
                for value in (display_name, app_name, title)
                if value
            ).lower()
            if query not in candidate_text:
                continue
        entries.append(
            {
                "window": window,
                "display_name": display_name,
                "app_name": app_name,
                "title": title,
                "switch_target": switch_target,
            }
        )

    normalized_counts: dict[str, int] = {}
    for entry in entries:
        normalized_name = entry["display_name"].lower()
        normalized_counts[normalized_name] = (
            normalized_counts.get(normalized_name, 0) + 1
        )

    normalized_seen: dict[str, int] = {}
    for entry in entries:
        normalized_name = entry["display_name"].lower()
        total = normalized_counts.get(normalized_name, 0)
        index = normalized_seen.get(normalized_name, 0) + 1
        normalized_seen[normalized_name] = index
        entry["duplicate_index"] = index
        entry["duplicate_total"] = total
        entry["display_label"] = (
            f'{entry["display_name"]} ({index})'
            if total > 1
            else entry["display_name"]
        )

    return entries


def _build_switch_window_reference(entry: dict[str, Any]) -> dict[str, Any]:
    window = dict(entry["window"])
    if entry.get("app_name") and not str(window.get("app_name") or "").strip():
        window["app_name"] = entry["app_name"]
    if entry.get("title") and not str(window.get("title") or "").strip():
        window["title"] = entry["title"]
    window.setdefault("window_name", entry.get("title") or entry.get("app_name") or "")
    window[_SWITCH_DUPLICATE_INDEX_KEY] = int(entry.get("duplicate_index") or 1)
    window[_SWITCH_DUPLICATE_TOTAL_KEY] = int(entry.get("duplicate_total") or 1)
    window[_SWITCH_DISPLAY_LABEL_KEY] = str(
        entry.get("display_label") or entry.get("display_name") or ""
    )
    return window


def _collect_window_display_names(
    windows: list[dict],
    *,
    filter_text: str = "",
) -> list[str]:
    return [
        str(entry["display_label"])
        for entry in _collect_window_display_entries(windows, filter_text=filter_text)
    ]


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
            target_ref, resolved_label = _resolve_target_reference(
                windows,
                tab_name,
                match_mode,
            )
            if not target_ref:
                return False, None
            success = manager.switch_to_window(target_ref)
            return success, resolved_label
        
        loop = asyncio.get_event_loop()
        success, resolved_title = await loop.run_in_executor(get_interactive_executor(), _switch)
        
        if not success:
            return {
                "success": False,
                "error": (
                    f"Could not find or switch to window with name: {tab_name}. "
                    "Use the app/window name from get_open_windows output for best results."
                ),
            }
        
        return {
            "success": True,
            "data": {
                "tab_name": resolved_title,
                "llm_content": f"Successfully switched to window '{resolved_title}'",
                "return_display": f"Successfully switched to window '{resolved_title}'",
            },
        }
    except Exception as e:
        logger.error(f"Error switching to window: {e}", exc_info=True)
        return {"success": False, "error": f"Window switching operation failed: {str(e)}"}


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


def _resolve_target_reference(
    windows: list[dict],
    tab_name: str,
    match_mode: str,
) -> tuple[str | dict[str, Any] | None, str | None]:
    entries = _collect_window_display_entries(windows)
    query = tab_name.strip()
    if not query:
        return None, None

    query_lower = query.lower()
    for entry in entries:
        if str(entry["display_label"]).lower() == query_lower:
            if int(entry.get("duplicate_total") or 1) > 1:
                return _build_switch_window_reference(entry), str(entry["display_label"])
            return str(entry["switch_target"]), str(entry["display_label"])

    candidates: list[tuple[str, str | dict[str, Any], str]] = []
    seen: set[tuple[str, str, str]] = set()
    for entry in entries:
        display_name = str(entry["display_name"])
        app_name = str(entry["app_name"])
        title = str(entry["title"])
        switch_target = str(entry["switch_target"])
        for candidate_label, candidate_target, candidate_kind in (
            (app_name, app_name, "app_name"),
            (title, title, "title"),
            (display_name, switch_target, "display_name"),
        ):
            if not candidate_label or not candidate_target:
                continue
            normalized_candidate = (
                candidate_kind,
                candidate_label.lower(),
                str(candidate_target).lower(),
            )
            if normalized_candidate in seen:
                continue
            seen.add(normalized_candidate)
            candidates.append((candidate_label, candidate_target, candidate_kind))

    normalized_mode = str(match_mode or "exact").strip().lower()
    if normalized_mode == "contains":
        for candidate_label, candidate_target, _candidate_kind in candidates:
            if query_lower in candidate_label.lower():
                return candidate_target, candidate_label
        return None, None

    if normalized_mode == "regex":
        pattern = re.compile(query, re.IGNORECASE)
        for candidate_label, candidate_target, _candidate_kind in candidates:
            if pattern.search(candidate_label):
                return candidate_target, candidate_label
        return None, None

    for candidate_label, candidate_target, _candidate_kind in candidates:
        if candidate_label.lower() == query_lower:
            return candidate_target, candidate_label
    return None, None
