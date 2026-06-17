"""
Remote computer-domain tool stubs.
"""

from __future__ import annotations

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer.schemas import (
    GroundedMouseActionArgs,
    GroundedScrollActionArgs,
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
    description = "Control mouse actions with schema-guided coordinate targeting."
    args_model = MouseControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self, args: MouseControlArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote mouse tool call: {args.action} at ({args.x}, {args.y})",
        )


class RemoteKeyboardTool(RemoteToolBase, Tool[KeyboardControlArgs]):
    name = "keyboard_control"
    description = (
        "Control keyboard input including typing text, clipboard paste, pressing keys, and shortcuts. "
        "After input, verify text appears in the latest captured screen image; do not assume tool success means input landed. "
        "If text is missing, refocus the field and retry. "
        "Use deterministic action sequences for predictable flows (for example, input text then press Enter only when submit is intended). "
        "Prefer this tool over mouse clicks when a shortcut or key-driven path exists."
    )
    args_model = KeyboardControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self, args: KeyboardControlArgs, ctx: ToolContext
    ) -> RemoteToolResult:
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

    async def execute_remote(
        self, args: ScreenshotToolArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args, ctx, log_message="Remote screenshot tool call"
        )


class RemoteScrollTool(RemoteToolBase, Tool[ScrollControlArgs]):
    name = "scroll_control"
    description = (
        "Control desktop scrolling actions. Target the scroll region using the currently enabled "
        "grounding fields exposed by this schema. Prefer 'manual' as it's less compute-heavy. "
        "Omit `clicks` on the first vertical scroll attempt so the executor uses its default "
        "click amount; use `clicks` only for follow-up fine tuning."
    )
    args_model = ScrollControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self, args: ScrollControlArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote scroll tool call: {args.action}",
        )


class RemoteSwitchTabTool(RemoteToolBase, Tool[SwitchTabArgs]):
    name = "switch_window"
    description = "Switch focus to a specific window by exact title. Use an exact known window title rather than blind OS-level cycling."
    args_model = SwitchTabArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self, args: SwitchTabArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote switch window tool call: {args.tab_name}",
        )


class RemoteWaitTool(RemoteToolBase, Tool[WaitToolArgs]):
    name = "wait"
    description = (
        "Wait for a specified number of seconds, then capture a fresh image of the current "
        "screen state. Useful for waiting for UI changes, animations, page loads, or async "
        "operations to complete. After execution, returns a status message and the captured image."
    )
    args_model = WaitToolArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self, args: WaitToolArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message="Remote wait tool call",
        )


class RemoteGetOpenWindowsTool(RemoteToolBase, Tool[GetOpenWindowsArgs]):
    name = "get_open_windows"
    description = (
        "Lists currently open windows that exist on the desktop and can be focused. "
        "Use it to discover candidate windows before assuming shortcuts, clicking, or typing "
        "will land in the intended place."
    )
    args_model = GetOpenWindowsArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self, args: GetOpenWindowsArgs, ctx: ToolContext
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args, ctx, log_message="Remote get open windows tool call"
        )


class RemoteGroundedMouseTool(RemoteToolBase, Tool[GroundedMouseActionArgs]):
    name = "grounded_mouse_action"
    description = (
        "Ground a semantic mouse action against the fields exposed by this schema, "
        "then execute it on the desktop."
    )
    args_model = GroundedMouseActionArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self,
        args: GroundedMouseActionArgs,
        ctx: ToolContext,
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote grounded mouse tool call: {args.action}",
        )


class RemoteGroundedScrollTool(RemoteToolBase, Tool[GroundedScrollActionArgs]):
    name = "grounded_scroll_action"
    description = (
        "Ground a semantic scroll action against the fields exposed by this schema, "
        "then execute it on the desktop."
    )
    args_model = GroundedScrollActionArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(
        self,
        args: GroundedScrollActionArgs,
        ctx: ToolContext,
    ) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote grounded scroll tool call: {args.action}",
        )
