"""OS-aware scroll configuration for standardized scrolling behavior.

Vertical scroll defaults are executor-owned coarse movements so one scroll
reveals materially more new content by default. Explicit `clicks` remain
available as an override for smaller or larger manual adjustments.
"""

import platform
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Standardized "scroll units" to OS-specific clicks mapping for explicit
# clicks overrides. One unit remains roughly one Windows/Linux wheel tick.
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

# Target lines per explicit scroll unit for standardization
TARGET_LINES_PER_UNIT = 3

# Default explicit scroll units when callers opt into click-based scrolling.
DEFAULT_SCROLL_UNITS = 5

# Coarse vertical scrolling targets a substantial chunk of the visible surface.
DEFAULT_SCREEN_HEIGHT = 900
COARSE_VERTICAL_SCROLL_REFERENCE_HEIGHT = 900
COARSE_VERTICAL_SCROLL_REFERENCE_UNITS = 10
COARSE_VERTICAL_SCROLL_MIN_UNITS = 8
COARSE_VERTICAL_SCROLL_MAX_UNITS = 16


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
    """Convert standardized scroll units to OS-specific pyautogui clicks.

    Args:
        requested_units: Number of scroll units (None = use default).
            One unit is visually ~3 lines of text.
        direction: Scroll direction (for logging purposes only).

    Returns:
        Number of clicks to pass to pyautogui.vscroll()/hscroll().
        Always returns at least 1 to ensure some scroll happens.
    """
    units = requested_units if requested_units is not None else DEFAULT_SCROLL_UNITS
    multiplier = get_os_scroll_multiplier()

    # Calculate clicks, round to int, ensure at least 1
    clicks = max(1, round(units * multiplier))

    logger.debug(
        f"Scroll calc: {units} units × {multiplier:.2f} = {clicks} clicks "
        f"({platform.system()})"
    )
    return clicks


def calculate_coarse_vertical_scroll_units(screen_height: Optional[int]) -> int:
    """Return display-aware coarse units for vertical scrolling."""
    normalized_height = _normalize_screen_height(screen_height)
    scaled_units = round(
        COARSE_VERTICAL_SCROLL_REFERENCE_UNITS
        * normalized_height
        / COARSE_VERTICAL_SCROLL_REFERENCE_HEIGHT
    )
    coarse_units = max(
        COARSE_VERTICAL_SCROLL_MIN_UNITS,
        min(COARSE_VERTICAL_SCROLL_MAX_UNITS, scaled_units),
    )
    logger.debug(
        "Coarse vertical scroll units: screen_height=%s -> %s units",
        normalized_height,
        coarse_units,
    )
    return coarse_units


def calculate_coarse_vertical_scroll_clicks(screen_height: Optional[int]) -> int:
    """Convert display-aware coarse vertical scroll units to OS clicks."""
    coarse_units = calculate_coarse_vertical_scroll_units(screen_height)
    multiplier = get_os_scroll_multiplier()
    clicks = max(1, round(coarse_units * multiplier))
    logger.debug(
        "Coarse vertical scroll: %s units × %.2f = %s clicks (%s)",
        coarse_units,
        multiplier,
        clicks,
        platform.system(),
    )
    return clicks


def get_scroll_diagnostics() -> dict:
    """Get diagnostic information about scroll configuration.
    
    Returns:
        Dictionary with OS, multiplier, and configuration details.
    """
    system = platform.system()
    config = SCROLL_MULTIPLIERS.get(system, SCROLL_MULTIPLIERS["Linux"])
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
        "target_lines_per_unit": TARGET_LINES_PER_UNIT,
        "default_explicit_scroll_units": DEFAULT_SCROLL_UNITS,
        "coarse_vertical_reference_height": COARSE_VERTICAL_SCROLL_REFERENCE_HEIGHT,
        "coarse_vertical_reference_units": COARSE_VERTICAL_SCROLL_REFERENCE_UNITS,
        "coarse_vertical_min_units": COARSE_VERTICAL_SCROLL_MIN_UNITS,
        "coarse_vertical_max_units": COARSE_VERTICAL_SCROLL_MAX_UNITS,
        "os_default_lines_per_tick": config["lines_per_tick"],
        "using_custom_windows_setting": is_custom,
    }
