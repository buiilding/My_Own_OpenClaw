"""Linux window manager implementation."""

import difflib
import logging
import subprocess
import unicodedata
from typing import List, Optional

from .base import BaseWindowManager

logger = logging.getLogger(__name__)

_WINDOW_TITLE_TRANSLATION = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u00a0": " ",
    }
)


class LinuxWindowManager(BaseWindowManager):
    """Linux-specific window management using xdotool."""
    _FUZZY_MATCH_THRESHOLD = 0.78
    _FUZZY_AMBIGUITY_MARGIN = 0.08
    
    def __init__(self):
        self._available = self._check_xdotool()
    
    def _check_xdotool(self) -> bool:
        """Check if xdotool is available."""
        try:
            subprocess.run(["xdotool", "--version"], capture_output=True, timeout=1, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("xdotool not available, window management disabled on Linux")
            return False
    
    def get_windows(self) -> List[dict]:
        """Get list of all open windows."""
        if not self._available:
            return []
        
        windows = []
        try:
            result = subprocess.run(
                ["xdotool", "search", "--onlyvisible", "--name", ".*"],
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                window_ids = result.stdout.strip().split("\n")
                for wid in window_ids:
                    if wid:
                        try:
                            name_result = subprocess.run(
                                ["xdotool", "getwindowname", wid],
                                capture_output=True,
                                text=True,
                                timeout=1
                            )
                            if name_result.returncode == 0:
                                title = name_result.stdout.strip()
                                if title:
                                    windows.append({"title": title, "hwnd": wid})
                        except Exception:
                            continue
        except Exception as e:
            logger.error(f"Error getting windows: {e}", exc_info=True)
        
        return windows
    
    def get_active_window(self) -> Optional[dict]:
        """Get active window."""
        if not self._available:
            return None
        
        try:
            result = subprocess.run(
                ["xdotool", "getactivewindow", "getwindowname"],
                capture_output=True,
                text=True,
                timeout=1
            )
            if result.returncode == 0:
                title = result.stdout.strip()
                if title:
                    return {"title": title, "hwnd": None}
        except Exception as e:
            logger.error(f"Error getting active window: {e}", exc_info=True)
        
        return None
    
    def switch_to_window(self, window_target: str | dict) -> bool:
        """Switch to a window by title or resolved window record."""
        if not self._available:
            return False

        try:
            windows = self.get_windows()
            target = None
            if isinstance(window_target, dict):
                requested_hwnd = window_target.get("hwnd")
                if requested_hwnd is not None:
                    target = next(
                        (
                            window
                            for window in windows
                            if str(window.get("hwnd")) == str(requested_hwnd)
                        ),
                        None,
                    )
                if target is None:
                    requested_title = str(window_target.get("title") or "").strip()
                    target = self._select_best_match(windows, requested_title)
            else:
                target = self._select_best_match(windows, str(window_target or ""))
            if not target:
                return False

            activate_result = subprocess.run(
                ["xdotool", "windowactivate", str(target["hwnd"])],
                capture_output=True,
                timeout=1,
            )
            return activate_result.returncode == 0
        except Exception as e:
            logger.error(f"Error switching to window: {e}", exc_info=True)

        return False

    @staticmethod
    def _normalize_title(title: str) -> str:
        if not isinstance(title, str):
            return ""
        normalized = unicodedata.normalize("NFKC", title)
        normalized = normalized.translate(_WINDOW_TITLE_TRANSLATION)
        normalized = " ".join(normalized.split())
        return normalized.casefold()

    def _select_best_match(self, windows: List[dict], requested_title: str) -> Optional[dict]:
        if not isinstance(requested_title, str) or not requested_title.strip():
            return None

        available = [
            window
            for window in windows
            if isinstance(window, dict)
            and isinstance(window.get("title"), str)
            and str(window.get("title")).strip()
            and window.get("hwnd") is not None
        ]
        if not available:
            return None

        requested_raw = requested_title.strip()
        requested_normalized = self._normalize_title(requested_raw)

        # 1) Raw exact match.
        for window in available:
            if window["title"] == requested_raw:
                return window

        # 2) Unicode/punctuation/case normalized exact match.
        normalized_windows = [
            (window, self._normalize_title(window["title"]))
            for window in available
        ]
        for window, title_normalized in normalized_windows:
            if title_normalized == requested_normalized:
                return window

        # 3) Substring match on normalized text.
        contains_matches = [
            (window, title_normalized)
            for window, title_normalized in normalized_windows
            if requested_normalized and requested_normalized in title_normalized
        ]
        if contains_matches:
            ranked_contains = sorted(
                contains_matches,
                key=lambda item: (
                    abs(len(item[1]) - len(requested_normalized)),
                    len(item[1]),
                ),
            )
            if len(ranked_contains) > 1:
                top_key = (
                    abs(len(ranked_contains[0][1]) - len(requested_normalized)),
                    len(ranked_contains[0][1]),
                )
                second_key = (
                    abs(len(ranked_contains[1][1]) - len(requested_normalized)),
                    len(ranked_contains[1][1]),
                )
                if top_key == second_key:
                    logger.info(
                        "Ambiguous substring window match for '%s': '%s' vs '%s'",
                        requested_title,
                        ranked_contains[0][0]["title"],
                        ranked_contains[1][0]["title"],
                    )
                    return None
            return ranked_contains[0][0]

        # 4) Conservative fuzzy match fallback.
        scored = sorted(
            (
                (
                    difflib.SequenceMatcher(None, requested_normalized, title_normalized).ratio(),
                    window,
                )
                for window, title_normalized in normalized_windows
                if title_normalized
            ),
            key=lambda item: item[0],
            reverse=True,
        )
        if not scored:
            return None

        top_score, top_window = scored[0]
        if top_score < self._FUZZY_MATCH_THRESHOLD:
            return None

        if len(scored) > 1:
            second_score = scored[1][0]
            if (top_score - second_score) < self._FUZZY_AMBIGUITY_MARGIN:
                logger.info(
                    "Ambiguous fuzzy window match for '%s': %.3f vs %.3f",
                    requested_title,
                    top_score,
                    second_score,
                )
                return None

        return top_window
