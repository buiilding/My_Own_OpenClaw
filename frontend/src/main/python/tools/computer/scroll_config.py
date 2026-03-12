"""OS-aware scroll configuration for targeted coarse scrolling behavior.

Explicit `clicks` are literal OS wheel clicks. Vertical scroll defaults are
executor-owned coarse literal click counts tuned per OS and scaled by display
height so one scroll reveals materially more new content by default.
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

# Default explicit OS clicks when callers opt into click-based scrolling and do
# not provide a value.
DEFAULT_SCROLL_CLICKS = 5

# Coarse vertical scrolling targets a substantial chunk of the visible surface
# using literal OS click counts chosen by the executor.
DEFAULT_SCREEN_HEIGHT = 900
COARSE_VERTICAL_SCROLL_BY_OS = {
    "Windows": {
        "reference_clicks": 10,
        "min_clicks": 8,
        "max_clicks": 16,
    },
    "Darwin": {
        "reference_clicks": 3,
        "min_clicks": 3,
        "max_clicks": 5,
    },
    "Linux": {
        "reference_clicks": 10,
        "min_clicks": 8,
        "max_clicks": 16,
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


def _normalize_screen_height(screen_height: Optional[int]) -> int:
    if isinstance(screen_height, int) and screen_height > 0:
        return screen_height
    return DEFAULT_SCREEN_HEIGHT


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
    clicks = max(1, int(requested_units if requested_units is not None else DEFAULT_SCROLL_CLICKS))

    logger.debug(
        "Explicit scroll clicks: requested=%s -> os_clicks=%s (%s, direction=%s)",
        requested_units,
        clicks,
        platform.system(),
        direction,
    )
    return clicks


def calculate_coarse_vertical_scroll_clicks(screen_height: Optional[int]) -> int:
    """Return display-aware coarse literal OS clicks for vertical scrolling."""
    normalized_height = _normalize_screen_height(screen_height)
    system = platform.system()
    config = COARSE_VERTICAL_SCROLL_BY_OS.get(system, COARSE_VERTICAL_SCROLL_BY_OS["Linux"])
    scaled_clicks = round(
        config["reference_clicks"]
        * normalized_height
        / DEFAULT_SCREEN_HEIGHT
    )
    coarse_clicks = max(
        config["min_clicks"],
        min(config["max_clicks"], scaled_clicks),
    )
    logger.debug(
        "Coarse vertical scroll clicks: screen_height=%s -> %s clicks (%s)",
        normalized_height,
        coarse_clicks,
        system,
    )
    return coarse_clicks


def get_scroll_diagnostics() -> dict:
    """Get diagnostic information about scroll configuration.
    
    Returns:
        Dictionary with OS, multiplier, and configuration details.
    """
    system = platform.system()
    config = SCROLL_MULTIPLIERS.get(system, SCROLL_MULTIPLIERS["Linux"])
    coarse_config = COARSE_VERTICAL_SCROLL_BY_OS.get(
        system,
        COARSE_VERTICAL_SCROLL_BY_OS["Linux"],
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
        "default_explicit_scroll_clicks": DEFAULT_SCROLL_CLICKS,
        "coarse_vertical_reference_height": DEFAULT_SCREEN_HEIGHT,
        "coarse_vertical_reference_clicks": coarse_config["reference_clicks"],
        "coarse_vertical_min_clicks": coarse_config["min_clicks"],
        "coarse_vertical_max_clicks": coarse_config["max_clicks"],
        "os_default_lines_per_tick": config["lines_per_tick"],
        "using_custom_windows_setting": is_custom,
    }
