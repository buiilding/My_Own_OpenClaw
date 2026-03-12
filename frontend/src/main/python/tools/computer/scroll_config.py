"""OS-aware scroll configuration for targeted scrolling behavior.

Explicit `clicks` are literal OS wheel clicks. When `clicks` is omitted, the
executor uses an OS-default literal click count.
"""

import logging
import platform
from typing import Optional

logger = logging.getLogger(__name__)

# Diagnostics for OS wheel behavior. Explicit `clicks` are now literal OS
# wheel clicks, but Windows settings still affect how much content one OS click
# moves, so these values remain useful for observability and future tuning.
TARGET_LINES_PER_UNIT = 3

SCROLL_MULTIPLIERS = {
    "Windows": {
        "default": 1.0,  # 1 scroll_unit = 1 Windows wheel tick (typically 3 lines)
        "lines_per_tick": 3,  # Windows default, read from registry if possible
    },
    "Darwin": {  # macOS
        "default": 0.3,  # macOS smooth scrolling - fewer clicks for same visual distance
        "lines_per_tick": 1,  # Not really applicable with smooth scroll
    },
    "Linux": {
        "default": 1.0,  # Most Linux DEs default to 3 lines like Windows
        "lines_per_tick": 3,
    },
}

# Default literal OS clicks when callers omit `clicks`.
DEFAULT_SCROLL_CLICKS_BY_OS = {
    "Windows": {
        "default_clicks": 10,
    },
    "Darwin": {
        "default_clicks": 5,
    },
    "Linux": {
        "default_clicks": 10,
    },
}


def _get_windows_scroll_lines() -> Optional[int]:
    """Read Windows wheel scroll lines from registry.
    
    Returns:
        Lines per wheel tick, or None if unable to read.
    """
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop"
        ) as key:
            lines, _ = winreg.QueryValueEx(key, "WheelScrollLines")
            if lines and isinstance(lines, int) and lines > 0:
                logger.debug(f"Windows registry: WheelScrollLines = {lines}")
                return lines
    except Exception as e:
        logger.debug(f"Could not read Windows scroll settings: {e}")
    return None


def get_os_scroll_multiplier() -> float:
    """Get the scroll multiplier for the current OS.
    
    The multiplier converts standardized scroll units to OS-specific clicks.
    
    Returns:
        Multiplier factor. Multiply scroll_units by this to get clicks.
    """
    system = platform.system()
    config = SCROLL_MULTIPLIERS.get(system, SCROLL_MULTIPLIERS["Linux"])
    multiplier = config["default"]

    # Try to read actual Windows settings from registry for precision
    if system == "Windows":
        actual_lines = _get_windows_scroll_lines()
        if actual_lines:
            # Normalize: if user has 6 lines/tick, we need fewer clicks
            # Target: TARGET_LINES_PER_UNIT lines per scroll_unit
            multiplier = TARGET_LINES_PER_UNIT / actual_lines
            logger.debug(
                f"Windows scroll: {actual_lines} lines/tick, "
                f"multiplier={multiplier:.2f}"
            )

    return multiplier


def calculate_scroll_clicks(
    requested_units: Optional[int], direction: Optional[str] = None
) -> int:
    """Return literal OS wheel clicks for explicit scroll overrides.

    Args:
        requested_units: Number of literal OS wheel clicks (None = use default).
        direction: Scroll direction (for logging purposes only).

    Returns:
        Number of literal clicks to pass to pyautogui.vscroll()/hscroll().
        Always returns at least 1 to ensure some scroll happens.
    """
    system = platform.system()
    default_clicks = DEFAULT_SCROLL_CLICKS_BY_OS.get(
        system,
        DEFAULT_SCROLL_CLICKS_BY_OS["Linux"],
    )["default_clicks"]
    clicks = max(1, int(requested_units if requested_units is not None else default_clicks))

    logger.debug(
        "Explicit scroll clicks: requested=%s -> os_clicks=%s (%s, direction=%s)",
        requested_units,
        clicks,
        platform.system(),
        direction,
    )
    return clicks


def get_default_scroll_clicks() -> int:
    """Return the executor-owned default literal OS click count."""
    system = platform.system()
    config = DEFAULT_SCROLL_CLICKS_BY_OS.get(
        system,
        DEFAULT_SCROLL_CLICKS_BY_OS["Linux"],
    )
    default_clicks = config["default_clicks"]
    logger.debug(
        "Default scroll clicks: %s clicks (%s)",
        default_clicks,
        system,
    )
    return default_clicks


def get_scroll_diagnostics() -> dict:
    """Get diagnostic information about scroll configuration.
    
    Returns:
        Dictionary with OS, multiplier, and configuration details.
    """
    system = platform.system()
    config = SCROLL_MULTIPLIERS.get(system, SCROLL_MULTIPLIERS["Linux"])
    default_config = DEFAULT_SCROLL_CLICKS_BY_OS.get(
        system,
        DEFAULT_SCROLL_CLICKS_BY_OS["Linux"],
    )
    multiplier = get_os_scroll_multiplier()
    
    # Check if using custom Windows setting
    is_custom = False
    if system == "Windows":
        actual_lines = _get_windows_scroll_lines()
        if actual_lines and actual_lines != config["lines_per_tick"]:
            is_custom = True

    return {
        "os": system,
        "multiplier": multiplier,
        "default_multiplier": config["default"],
        "default_scroll_clicks": default_config["default_clicks"],
        "os_default_lines_per_tick": config["lines_per_tick"],
        "using_custom_windows_setting": is_custom,
    }
