"""
Remote computer-domain tool stubs.
"""

from __future__ import annotations

import uuid

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
    description = (
        "Control mouse actions with schema-guided coordinate targeting. "
        "Prefer keyboard shortcuts and app-native navigation first; use mouse interaction when needed. "
        "Use find_coordinates_by='ocr' with exact ocr_text for initial targeting. "
        "For text fields, pass the exact visible string (for example: 'type something here'). "
        "When OCR is ambiguous, retry with candidate_id from the ambiguity response. "
        "For manual coordinates, use screenshot pixels from the latest image and beware of the mouse position "
        "on that image when grounding x/y. Do not treat tool status alone as success; confirm expected UI state "
        "change, and use cursor position as one verification signal."
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
    description = (
        "Control keyboard input including typing text, clipboard paste, pressing keys, and shortcuts. "
        "Default to action='type' for first-attempt text entry. "
        "Use action='paste' mainly as fallback when action='type' does not land text. "
        "After input, verify text appears in the latest screenshot; do not assume tool success means input landed. "
        "If text is missing, retry once with action='paste', then refocus the field and retry. "
        "Use deterministic action sequences for predictable flows (for example, input text then press Enter only when submit is intended). "
        "Prefer this tool over mouse clicks when a shortcut or key-driven path exists."
    )
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
    description = (
        "Control desktop scrolling actions. Target the scroll region with exact visible text "
        "via OCR, a detailed visual `source_description` via prediction, or manual x/y from "
        "the latest screenshot when grounding is already known. Omit `clicks` on the first "
        "vertical scroll attempt for the default click amount (8 on macOS, 5 on "
        "Windows/Linux); treat `clicks` as fallback-only for follow-up fine tuning "
        "when a specific manual adjustment is needed. When provided, `clicks` means "
        "literal OS wheel clicks."
    )
    args_model = ScrollControlArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: ScrollControlArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote scroll tool call: {args.action}",
        )


class RemoteSwitchTabTool(RemoteToolBase, Tool[SwitchTabArgs]):
    name = "switch_window"
    description = (
        "Switch focus to a specific window by exact title. "
        "Get valid titles from get_open_windows and switch by name instead of blind OS-level cycling."
    )
    args_model = SwitchTabArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: SwitchTabArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(
            args,
            ctx,
            log_message=f"Remote switch window tool call: {args.tab_name}",
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
        "Lists currently open windows that exist on the desktop and can potentially be focused. "
        "This does not mean any listed window is currently active or focused. "
        "Use it to discover candidate windows, then use switch_window to focus the intended one "
        "before assuming shortcuts, clicking, or typing will land there."
    )
    args_model = GetOpenWindowsArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: GetOpenWindowsArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(args, ctx, log_message="Remote get open windows tool call")


class RemoteGroundedMouseTool(RemoteToolBase, Tool[GroundedMouseActionArgs]):
    name = "grounded_mouse_action"
    description = (
        "Ground a semantic mouse action against OCR text or a visual description, "
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
        "Ground a semantic scroll action against OCR text or a visual description, "
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

_COMPUTER_USE_MODEL_BY_TOOL = {
    "mouse_control": RemoteMouseTool.args_model,
    "keyboard_control": RemoteKeyboardTool.args_model,
    "screenshot": RemoteScreenshotTool.args_model,
    "scroll_control": RemoteScrollTool.args_model,
    "switch_window": RemoteSwitchTabTool.args_model,
    "wait": RemoteWaitTool.args_model,
}
