"""macOS window manager implementation."""

from collections.abc import Mapping
import logging
import subprocess
import time
from typing import List, Optional

from .base import BaseWindowManager

logger = logging.getLogger(__name__)


class MacOSWindowManager(BaseWindowManager):
    """macOS-specific window management using AppKit."""
    
    def __init__(self):
        try:
            from AppKit import (
                NSApplicationActivationPolicyRegular,
                NSApplicationActivateIgnoringOtherApps,
                NSWorkspace,
            )
            import Quartz

            self.NSWorkspace = NSWorkspace
            self.NSApplicationActivationPolicyRegular = (
                NSApplicationActivationPolicyRegular
            )
            self.NSApplicationActivateIgnoringOtherApps = (
                NSApplicationActivateIgnoringOtherApps
            )
            self.Quartz = Quartz
            self._available = True
        except ImportError:
            logger.warning("AppKit/Quartz not available, window management disabled on macOS")
            self._available = False

    @staticmethod
    def _coerce_quartz_window_record(raw_window):
        if isinstance(raw_window, Mapping):
            return raw_window
        if hasattr(raw_window, "get"):
            return raw_window
        try:
            coerced_window = dict(raw_window)
        except (TypeError, ValueError):
            return None
        return coerced_window if hasattr(coerced_window, "get") else None

    def _summarize_quartz_window(self, raw_window) -> dict:
        window_record = self._coerce_quartz_window_record(raw_window)
        if window_record is None:
            return {
                "type": type(raw_window).__name__,
                "repr": repr(raw_window)[:120],
            }

        def _pick(*keys):
            for key in keys:
                value = window_record.get(key)
                if value not in {None, ""}:
                    return value
            return None

        return {
            "id": _pick("id", "kCGWindowNumber"),
            "owner": str(_pick("owner", "kCGWindowOwnerName") or "").strip(),
            "name": str(_pick("name", "kCGWindowName") or "").strip(),
            "layer": _pick("layer", "kCGWindowLayer"),
            "alpha": _pick("alpha", "kCGWindowAlpha"),
        }

    def _debug_log_quartz_enumeration(
        self,
        *,
        on_screen_only: bool,
        raw_count: int,
        usable_count: int,
        dropped_non_dict: int,
        dropped_non_regular_app: int,
        dropped_layer: int,
        dropped_alpha: int,
        dropped_title: int,
        sample_records: List[dict],
    ) -> None:
        if not logger.isEnabledFor(logging.DEBUG):
            return

        logger.debug(
            "Quartz window enumeration debug (on_screen_only=%s): raw=%s usable=%s "
            "dropped_non_dict=%s dropped_non_regular_app=%s dropped_layer=%s "
            "dropped_alpha=%s dropped_title=%s",
            on_screen_only,
            raw_count,
            usable_count,
            dropped_non_dict,
            dropped_non_regular_app,
            dropped_layer,
            dropped_alpha,
            dropped_title,
        )
        if sample_records:
            logger.debug("Quartz window enumeration samples: %s", sample_records)

    def _list_running_app_records(self) -> List[dict]:
        if not self._available:
            return []

        regular_app_names = self._get_regular_running_app_names()
        if not regular_app_names:
            return []

        workspace = self.NSWorkspace.sharedWorkspace()
        running_apps = workspace.runningApplications()
        windows: List[dict] = []
        for app in running_apps:
            app_name = app.localizedName()
            if not app_name or app_name not in regular_app_names:
                continue
            windows.append(
                {
                    "title": app_name,
                    "hwnd": None,
                    "app_name": app_name,
                    "window_name": app_name,
                }
            )
        logger.info(
            "macOS window listing fallback enumerated %s running apps",
            len(windows),
        )
        return windows

    def _get_regular_running_app_names(self) -> set[str]:
        if not self._available:
            return set()

        workspace = self.NSWorkspace.sharedWorkspace()
        running_apps = workspace.runningApplications()
        regular_app_names: set[str] = set()
        for app in running_apps:
            app_name = app.localizedName()
            if not app_name:
                continue
            try:
                activation_policy = app.activationPolicy()
            except Exception:
                activation_policy = None
            if activation_policy != self.NSApplicationActivationPolicyRegular:
                continue
            try:
                if app.isHidden():
                    continue
            except Exception:
                pass
            regular_app_names.add(app_name)
        return regular_app_names

    def _list_window_records(self, *, on_screen_only: bool) -> List[dict]:
        if not self._available:
            return []

        options = self.Quartz.kCGWindowListExcludeDesktopElements
        if on_screen_only:
            options |= self.Quartz.kCGWindowListOptionOnScreenOnly
        else:
            options |= self.Quartz.kCGWindowListOptionAll

        raw_windows = (
            self.Quartz.CGWindowListCopyWindowInfo(
                options,
                self.Quartz.kCGNullWindowID,
            ) or []
        )
        windows: List[dict] = []
        sample_records: List[dict] = []
        dropped_non_dict = 0
        dropped_non_regular_app = 0
        dropped_layer = 0
        dropped_alpha = 0
        dropped_title = 0
        regular_app_names = self._get_regular_running_app_names()
        for raw_window in raw_windows:
            window_record = self._coerce_quartz_window_record(raw_window)
            if window_record is None:
                dropped_non_dict += 1
                if len(sample_records) < 5:
                    sample_records.append(
                        {
                            "decision": "drop_non_dict",
                            "window": self._summarize_quartz_window(raw_window),
                        }
                    )
                continue

            owner_name = str(
                window_record.get(self.Quartz.kCGWindowOwnerName) or ""
            ).strip()
            if regular_app_names and owner_name not in regular_app_names:
                dropped_non_regular_app += 1
                if len(sample_records) < 5:
                    sample_records.append(
                        {
                            "decision": "drop_non_regular_app",
                            "window": self._summarize_quartz_window(raw_window),
                        }
                    )
                continue
            window_name = str(
                window_record.get(self.Quartz.kCGWindowName) or ""
            ).strip()
            layer = int(window_record.get(self.Quartz.kCGWindowLayer, 0) or 0)
            alpha = float(window_record.get(self.Quartz.kCGWindowAlpha, 1.0) or 0.0)

            if layer != 0:
                dropped_layer += 1
                if len(sample_records) < 5:
                    sample_records.append(
                        {
                            "decision": "drop_layer",
                            "window": self._summarize_quartz_window(raw_window),
                        }
                    )
                continue
            if alpha <= 0:
                dropped_alpha += 1
                if len(sample_records) < 5:
                    sample_records.append(
                        {
                            "decision": "drop_alpha",
                            "window": self._summarize_quartz_window(raw_window),
                        }
                    )
                continue

            title = window_name or owner_name
            if not title:
                dropped_title += 1
                if len(sample_records) < 5:
                    sample_records.append(
                        {
                            "decision": "drop_title",
                            "window": self._summarize_quartz_window(raw_window),
                        }
                    )
                continue

            windows.append(
                {
                    "title": title,
                    "hwnd": window_record.get(self.Quartz.kCGWindowNumber),
                    "app_name": owner_name or title,
                    "window_name": window_name or title,
                }
            )
            if len(sample_records) < 5:
                sample_records.append(
                    {
                        "decision": "keep",
                        "window": self._summarize_quartz_window(raw_window),
                    }
                )

        self._debug_log_quartz_enumeration(
            on_screen_only=on_screen_only,
            raw_count=len(raw_windows),
            usable_count=len(windows),
            dropped_non_dict=dropped_non_dict,
            dropped_non_regular_app=dropped_non_regular_app,
            dropped_layer=dropped_layer,
            dropped_alpha=dropped_alpha,
            dropped_title=dropped_title,
            sample_records=sample_records,
        )

        return windows

    @staticmethod
    def _escape_applescript_string(value: str) -> str:
        return str(value).replace("\\", "\\\\").replace('"', '\\"')

    def _raise_window_via_applescript(self, app_name: str, window_name: str) -> bool:
        escaped_app_name = self._escape_applescript_string(app_name)
        escaped_window_name = self._escape_applescript_string(window_name)
        script = f'''
tell application "System Events"
    tell process "{escaped_app_name}"
        if exists (first window whose name is "{escaped_window_name}") then
            set frontmost to true
            set targetWindow to first window whose name is "{escaped_window_name}"
            try
                perform action "AXRaise" of targetWindow
            end try
            try
                set value of attribute "AXMain" of targetWindow to true
            end try
            return "true"
        end if
    end tell
end tell
return "false"
'''
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=2,
        )
        return result.returncode == 0 and "true" in (result.stdout or "").lower()

    def _wait_for_active_window(
        self,
        target_title: str,
        app_name: str,
        timeout_seconds: float = 1.0,
        poll_seconds: float = 0.05,
    ) -> bool:
        deadline = time.monotonic() + max(0.0, timeout_seconds)
        normalized_target = target_title.strip().lower()
        normalized_app_name = app_name.strip().lower()

        while time.monotonic() <= deadline:
            active_window = self.get_active_window()
            if active_window:
                active_title = str(active_window.get("title") or "").strip().lower()
                active_app_name = str(active_window.get("app_name") or "").strip().lower()
                if active_title == normalized_target:
                    return True
                if normalized_target and normalized_target in active_title:
                    return True
                if active_app_name == normalized_app_name and active_title in {
                    normalized_target,
                    normalized_app_name,
                }:
                    return True
            time.sleep(max(0.0, poll_seconds))

        return False
    
    def get_windows(self) -> List[dict]:
        """Get list of all open windows."""
        if not self._available:
            return []

        try:
            window_records = self._list_window_records(on_screen_only=True)
            if not window_records:
                logger.info(
                    "Quartz window enumeration returned no usable macOS windows; "
                    "falling back to running applications",
                )
                window_records = self._list_running_app_records()
            else:
                logger.info(
                    "Quartz window enumeration returned %s usable macOS windows",
                    len(window_records),
                )
            return [
                {
                    "title": window["title"],
                    "hwnd": window["hwnd"],
                    "app_name": window["app_name"],
                }
                for window in window_records
            ]
        except Exception as e:
            logger.error(f"Error getting windows: {e}", exc_info=True)

        return []
    
    def get_active_window(self) -> Optional[dict]:
        """Get active window."""
        if not self._available:
            return None

        try:
            windows = self._list_window_records(on_screen_only=True)
            if windows:
                active_window = windows[0]
                return {
                    "title": active_window["title"],
                    "hwnd": active_window["hwnd"],
                    "app_name": active_window["app_name"],
                }

            workspace = self.NSWorkspace.sharedWorkspace()
            app = workspace.activeApplication()
            app_name = app.get("NSApplicationName")
            if app_name:
                return {"title": app_name, "hwnd": None, "app_name": app_name}
        except Exception as e:
            logger.error(f"Error getting active window: {e}", exc_info=True)

        return None
    
    def switch_to_window(self, window_title: str) -> bool:
        """Switch to a window by title."""
        if not self._available:
            return False

        try:
            target_window = None
            normalized_requested_title = window_title.lower()
            candidate_windows = self._list_window_records(on_screen_only=False)
            if not candidate_windows:
                candidate_windows = self._list_running_app_records()
            for window in candidate_windows:
                if (
                    normalized_requested_title in window["title"].lower()
                    or normalized_requested_title in window["app_name"].lower()
                ):
                    target_window = window
                    break

            if not target_window:
                return False

            workspace = self.NSWorkspace.sharedWorkspace()
            running_apps = workspace.runningApplications()

            for app in running_apps:
                app_name = app.localizedName()
                if app_name and target_window["app_name"].lower() == app_name.lower():
                    app.activateWithOptions_(
                        self.NSApplicationActivateIgnoringOtherApps
                    )
                    raised_window = self._raise_window_via_applescript(
                        target_window["app_name"],
                        target_window["window_name"],
                    )
                    if not raised_window and target_window["window_name"] != target_window["app_name"]:
                        logger.info(
                            "AppleScript window raise did not confirm activation for '%s'",
                            target_window["window_name"],
                        )
                    return self._wait_for_active_window(
                        target_window["title"],
                        target_window["app_name"],
                    )
        except Exception as e:
            logger.error(f"Error switching to window: {e}", exc_info=True)

        return False
