"""
Remote computer-domain tool stubs.
"""

from __future__ import annotations

import uuid

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer.schemas import (
    KeyboardControlArgs,
    MouseControlArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.system.schemas import GetOpenWindowsArgs


class RemoteMouseTool(RemoteToolBase, Tool[MouseControlArgs]):
    name = "mouse_control"
    description = (
        "Control mouse actions with manual coordinates. Supports clicking, "
        "double-clicking, right-clicking, moving, dragging, and scrolling."
    )
    args_model = MouseControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: MouseControlArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote mouse tool call: {args.action} at ({args.x}, {args.y})",
        )


class RemoteKeyboardTool(RemoteToolBase, Tool[KeyboardControlArgs]):
    name = "keyboard_control"
    description = "Control keyboard input including typing text, pressing keys, and keyboard shortcuts."
    args_model = KeyboardControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: KeyboardControlArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote keyboard tool call: {args.action}",
        )


class RemoteScreenshotTool(RemoteToolBase, Tool[ScreenshotToolArgs]):
    name = "screenshot"
    description = "Capture a screenshot of the current computer screen."
    args_model = ScreenshotToolArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: ScreenshotToolArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(args, ctx, log_message="Remote screenshot tool call")


class RemoteScrollTool(RemoteToolBase, Tool[ScrollControlArgs]):
    name = "scroll_control"
    description = "Control scrolling actions including up, down, left, and right scrolling."
    args_model = ScrollControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: ScrollControlArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote scroll tool call: {args.action}",
        )


class RemoteSwitchTabTool(RemoteToolBase, Tool[SwitchTabArgs]):
    name = "switch_tab"
    description = (
        "Switch focus to a specific window/tab by name. Use this to navigate between open "
        "windows or browser tabs using the exact name shown in get_open_windows."
    )
    args_model = SwitchTabArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: SwitchTabArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote switch tab tool call: {args.tab_name}",
        )


class RemoteWaitTool(RemoteToolBase, Tool[WaitToolArgs]):
    name = "wait"
    description = (
        "Wait for a specified number of seconds, then capture a screenshot of the current "
        "screen state. Useful for waiting for UI changes, animations, page loads, or async "
        "operations to complete. After execution, returns a status message and a screenshot image."
    )
    args_model = WaitToolArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: WaitToolArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            request_id=str(uuid.uuid4()),
            log_message="Remote wait tool call",
        )


class RemoteGetOpenWindowsTool(RemoteToolBase, Tool[GetOpenWindowsArgs]):
    name = "get_open_windows"
    description = (
        "Lists all currently open window titles. Use this to check if an app is already open "
        "before launching a new instance."
    )
    args_model = GetOpenWindowsArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: GetOpenWindowsArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(args, ctx, log_message="Remote get open windows tool call")
