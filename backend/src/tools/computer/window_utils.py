"""
Utility functions for window management.
"""
import subprocess
import logging

logger = logging.getLogger(__name__)


def get_active_window_title() -> str:
    """
    Retrieves the title of the currently active window using xdotool.
    
    Returns:
        Window title string, or "No Active Window" if no window is focused or an error occurs.
    """
    try:
        result = subprocess.check_output(
            ["xdotool", "getactivewindow", "getwindowname"],
            stderr=subprocess.DEVNULL,
            timeout=1.0
        ).decode("utf-8").strip()
        return result if result else "No Active Window"
    except subprocess.CalledProcessError:
        # This happens when no window is active or xdotool fails to find one
        return "No Active Window"
    except subprocess.TimeoutExpired:
        logger.warning("xdotool command timed out while getting active window")
        return "No Active Window"
    except FileNotFoundError:
        logger.warning("xdotool not found. Active window tracking unavailable.")
        return "No Active Window"
    except Exception as e:
        logger.warning(f"Error getting active window: {e}")
        return "No Active Window"


def format_active_window_tag(window_title: str) -> str:
    """
    Format the active window title as an XML tag for LLM messages.
    
    Args:
        window_title: The active window title
        
    Returns:
        Formatted string with XML tags
    """
    return f"<current_focused_window>\n{window_title}\n</current_focused_window>\n\n"

