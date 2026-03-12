"""
Remote computer-domain tool stubs.
"""

from __future__ import annotations

import uuid
from typing import Any, Type

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer.schemas import (
    ComputerUseArgs,
    KeyboardControlArgs,
    MouseControlArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult
from backend.src.tools.system.schemas import GetOpenWindowsArgs

_COMPUTER_USE_MODEL_BY_TOOL: dict[str, Type[Any]] = {
    "mouse_control": MouseControlArgs,
    "keyboard_control": KeyboardControlArgs,
    "screenshot": ScreenshotToolArgs,
    "scroll_control": ScrollControlArgs,
    "switch_tab": SwitchTabArgs,
    "wait": WaitToolArgs,
}


class RemoteComputerUseTool(RemoteToolBase, Tool[ComputerUseArgs]):
    name = "computer_use"
    description = (
        "Unified computer-use tool. "
        "Select concrete action via `tool`, pass action arguments via `arguments`, "
        "and always include required metadata "
        "(`description`, `explanation`, `expectation`). "
        "For mouse targeting, use `find_coordinates_by='ocr'` with exact `ocr_text` "
        "for text targets, and use `find_coordinates_by='prediction'` with "
        "a detailed visual `source_description` for non-text targets. "
        "For drag destinations using prediction, provide `destination_description`."
    )
    args_model = ComputerUseArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: ComputerUseArgs, ctx: ToolContext) -> RemoteToolResult:
        tool_name = args.tool
        model = _COMPUTER_USE_MODEL_BY_TOOL[tool_name]
        validated_args = model.model_validate(args.arguments)
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name=tool_name,
            args=validated_args.model_dump(),
            request_id=request_id,
        )


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
        "vertical scroll attempt for the default coarse step; treat `clicks` as fallback-only "
        "for follow-up fine tuning when a specific manual adjustment is needed. When provided, "
        "`clicks` means literal OS wheel clicks."
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
    name = "switch_tab"
    description = (
        "Switch focus to a specific window/tab by exact title. "
        "Get valid titles from get_open_windows and switch by name instead of blind OS-level cycling."
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
        "before launching a new instance, and as the source of exact target names for switch_tab."
    )
    args_model = GetOpenWindowsArgs
    category = ToolDomain.COMPUTER

    async def execute_remote(self, args: GetOpenWindowsArgs, ctx: ToolContext) -> RemoteToolResult:
        return self._build_remote_result(args, ctx, log_message="Remote get open windows tool call")
