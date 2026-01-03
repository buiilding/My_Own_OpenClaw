"""
Frontend System Tools

Tools for system operations like listing windows and getting system stats.
"""

import logging
import subprocess
import platform
from typing import Dict, Any, List
from pydantic import BaseModel, Field

from tools.base import FrontendTool, SimpleToolResult

logger = logging.getLogger(__name__)


class SwitchTabArgs(BaseModel):
    """Arguments for switching to a specific tab/window."""
    tab_name: str = Field(
        ...,
        description="The exact name of the tab/window to switch to, as it appears in get_open_windows output."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    expectation: str = Field(
        ...,
        description="One sentence describing what you expect to see in the screenshot after switching to this tab."
    )


class GetOpenWindowsArgs(BaseModel):
    """Arguments for listing open windows."""
    filter_text: str = Field(
        default="",
        description="Optional text to filter window titles by (case-insensitive)."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class GetSystemStatsArgs(BaseModel):
    """Arguments for checking system stats."""
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class SwitchTabTool(FrontendTool[SwitchTabArgs]):
    """
    Tool to switch to a specific tab/window by name.
    """
    name = "switch_tab"
    description = "Switch focus to a specific window/tab by name. Use this to navigate between open windows or browser tabs using the exact name shown in get_open_windows."
    args_model = SwitchTabArgs
    auto_capture_image = "screenshot"

    async def run(self, args: SwitchTabArgs) -> Dict[str, Any]:
        """
        Switch to the specified tab/window.
        """
        try:
            logger.info(f"Switching to tab/window: {args.tab_name}")

            # Attempt to switch to the window
            success = await self._switch_to_window(args.tab_name)

            if not success:
                error_msg = f"Could not find or switch to window/tab with name: {args.tab_name}"
                logger.warning(error_msg)

                return SimpleToolResult.failure(
                    f"{error_msg}. Make sure the tab/window name matches exactly what appears in get_open_windows output."
                ).to_dict()

            # Success response
            success_msg = f"Successfully switched to tab '{args.tab_name}'"

            return {
                "success": True,
                "data": {
                    "tab_name": args.tab_name,
                    "llm_content": success_msg,
                    "return_display": success_msg,
                }
            }

        except Exception as e:
            error_msg = f"Tab switching operation failed: {str(e)}"
            logger.error(f"Switch tab tool error: {e}", exc_info=True)

            return SimpleToolResult.failure(error_msg).to_dict()

    async def _switch_to_window(self, window_title: str) -> bool:
        """Switch focus to a window with the given title."""
        import asyncio
        from core.thread_pool import get_executor

        loop = asyncio.get_running_loop()
        executor = get_executor()

        try:
            system = platform.system()

            if system == "Windows":
                return await loop.run_in_executor(
                    executor, self._switch_to_window_windows, window_title
                )
            elif system == "Linux":
                return await loop.run_in_executor(
                    executor, self._switch_to_window_linux, window_title
                )
            elif system == "Darwin":  # macOS
                return await loop.run_in_executor(
                    executor, self._switch_to_window_macos, window_title
                )
            else:
                logger.warning(f"Unsupported platform for window switching: {system}")
                return False
        except Exception as e:
            logger.error(f"Error switching window: {e}")
            return False

    def _switch_to_window_windows(self, window_title: str) -> bool:
        """Windows implementation of window switching."""
        try:
            import win32gui
            import win32con

            def find_and_activate_window(hwnd, target_title):
                if win32gui.IsWindowVisible(hwnd):
                    title = win32gui.GetWindowText(hwnd)
                    if title and target_title.lower() in title.lower():
                        try:
                            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                            win32gui.SetForegroundWindow(hwnd)
                            return True
                        except Exception as e:
                            logger.debug(f"Error activating window: {e}")
                return False

            result = win32gui.EnumWindows(find_and_activate_window, window_title)
            return result if result is True else False
        except ImportError:
            return False
        except Exception:
            return False

    def _switch_to_window_linux(self, window_title: str) -> bool:
        """Linux implementation of window switching."""
        try:
            result = subprocess.run(
                ["wmctrl", "-l"],
                capture_output=True,
                text=True,
                timeout=2.0
            )

            if result.returncode != 0:
                return False

            target_window_id = None
            for line in result.stdout.splitlines():
                parts = line.split(maxsplit=3)
                if len(parts) >= 4:
                    window_id = parts[0]
                    title = parts[3]
                    if window_title.lower() in title.lower():
                        target_window_id = window_id
                        break

            if target_window_id:
                activate_result = subprocess.run(
                    ["wmctrl", "-i", "-a", target_window_id],
                    capture_output=True,
                    timeout=2.0
                )
                return activate_result.returncode == 0

            return False
        except Exception:
            return False

    def _switch_to_window_macos(self, window_title: str) -> bool:
        """macOS implementation of window switching."""
        try:
            script = f'''
            tell application "System Events"
                set windowList to every window of every process
                repeat with aWindow in windowList
                    try
                        set windowTitle to title of aWindow
                        if windowTitle contains "{window_title}" then
                            set frontmost of process of aWindow to true
                            set index of aWindow to 1
                            return true
                        end if
                    end try
                end repeat
            end tell
            return false
            '''
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                text=True,
                timeout=2.0
            )
            return result.returncode == 0 and "true" in result.stdout
        except Exception:
            return False


class GetOpenWindowsTool(FrontendTool[GetOpenWindowsArgs]):
    """
    Tool to list all currently open windows.
    """
    name = "get_open_windows"
    description = "Lists all currently open window titles. Use this to check if an app is already open before launching a new instance."
    args_model = GetOpenWindowsArgs

    async def run(self, args: GetOpenWindowsArgs) -> Dict[str, Any]:
        """
        Get list of open windows.
        """
        try:
            windows = await self._get_open_windows()

            if args.filter_text:
                query = args.filter_text.lower()
                windows = [w for w in windows if query in w.lower()]

            if not windows:
                content = "No open windows found."
            else:
                content = "\n".join(f"- {w}" for w in windows)

            return {
                "success": True,
                "data": {
                    "windows": windows,
                    "llm_content": content,
                }
            }

        except Exception as e:
            logger.error(f"Get open windows tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to get open windows: {str(e)}").to_dict()

    async def _get_open_windows(self) -> List[str]:
        """Get list of all open window titles."""
        import asyncio
        from core.thread_pool import get_executor

        loop = asyncio.get_running_loop()
        executor = get_executor()

        try:
            system = platform.system()

            if system == "Windows":
                return await loop.run_in_executor(executor, self._get_open_windows_windows)
            elif system == "Linux":
                return await loop.run_in_executor(executor, self._get_open_windows_linux)
            elif system == "Darwin":  # macOS
                return await loop.run_in_executor(executor, self._get_open_windows_macos)
            else:
                return []
        except Exception as e:
            logger.error(f"Error getting open windows: {e}")
            return []

    def _get_open_windows_windows(self) -> List[str]:
        """Windows implementation of getting open windows."""
        windows = []
        try:
            import win32gui

            def enum_windows_callback(hwnd, windows_list):
                if win32gui.IsWindowVisible(hwnd):
                    title = win32gui.GetWindowText(hwnd)
                    if title:
                        windows_list.append(title)
                return True

            win32gui.EnumWindows(enum_windows_callback, windows)
        except Exception:
            pass
        return windows

    def _get_open_windows_linux(self) -> List[str]:
        """Linux implementation of getting open windows."""
        windows = []
        try:
            output = subprocess.check_output(
                ["wmctrl", "-l"],
                stderr=subprocess.DEVNULL,
                timeout=2.0
            ).decode("utf-8")

            for line in output.splitlines():
                parts = line.split(maxsplit=3)
                if len(parts) >= 4:
                    title = parts[3]
                    windows.append(title)
        except Exception:
            pass
        return windows

    def _get_open_windows_macos(self) -> List[str]:
        """macOS implementation of getting open windows."""
        windows = []
        try:
            script = '''
            tell application "System Events"
                set windowList to {}
                set processList to every process
                repeat with aProcess in processList
                    try
                        set windowList to windowList & (name of every window of aProcess)
                    end try
                end repeat
                return windowList
            end tell
            '''
            output = subprocess.check_output(
                ["osascript", "-e", script],
                stderr=subprocess.DEVNULL,
                timeout=2.0
            ).decode("utf-8")
            windows = [w.strip() for w in output.split(",") if w.strip()]
        except Exception:
            pass
        return windows


class GetSystemStatsTool(FrontendTool[GetSystemStatsArgs]):
    """
    Tool to get current system resource usage.
    """
    name = "get_system_stats"
    description = "Returns current system resource usage (CPU %, Memory %, Battery). Use this to check system performance before running resource-intensive operations."
    args_model = GetSystemStatsArgs

    def __init__(self):
        self._psutil = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize psutil for system stats."""
        if self._initialized:
            return True

        try:
            import psutil
            self._psutil = psutil
            self._initialized = True
            return True
        except ImportError:
            return False
        except Exception:
            return False

    async def run(self, args: GetSystemStatsArgs) -> Dict[str, Any]:
        """
        Get system resource usage.
        """
        try:
            stats = await self._get_system_stats()

            import json
            content = json.dumps(stats, indent=2)

            return {
                "success": True,
                "data": {
                    "stats": stats,
                    "llm_content": content,
                }
            }

        except Exception as e:
            logger.error(f"Get system stats tool error: {e}", exc_info=True)
            return SimpleToolResult.failure(f"Failed to get system stats: {str(e)}").to_dict()

    async def _get_system_stats(self) -> Dict[str, Any]:
        """Get system resource usage."""
        import asyncio

        stats = {
            "cpu_percent": 0.0,
            "memory_percent": 0.0,
            "battery_percent": None,
            "battery_charging": None
        }

        if not await self.initialize():
            return stats

        loop = asyncio.get_running_loop()
        from core.thread_pool import get_executor
        executor = get_executor()

        try:
            cpu_percent = await loop.run_in_executor(
                executor, self._psutil.cpu_percent, None
            )
            memory = await loop.run_in_executor(
                executor, self._psutil.virtual_memory
            )
            battery = await loop.run_in_executor(
                executor, self._psutil.sensors_battery
            )

            stats["cpu_percent"] = cpu_percent
            stats["memory_percent"] = memory.percent

            if battery:
                stats["battery_percent"] = round(battery.percent, 1)
                stats["battery_charging"] = battery.power_plugged

        except Exception:
            pass

        return stats
