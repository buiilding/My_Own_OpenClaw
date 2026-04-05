"""
Remote computer-domain tool stubs.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from backend.src.core.events.streaming_events import ToolBundleEvent
from backend.src.core.interfaces.tool import ToolResult
from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.execution_timeout import resolve_bundle_wait_timeout_seconds
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.computer.schemas import (
    GroundedMouseActionArgs,
    GroundedScrollActionArgs,
    KeyboardControlArgs,
    MouseControlArgs,
    OpenAIComputerArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)
from backend.src.llm.parser_types import ParsedToolCall
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


def _tool_step(
    *,
    name: str,
    args: dict[str, Any],
    action_payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "name": name,
        "args": args,
        "metadata": {
            "provider_native_computer_action": dict(action_payload),
        },
    }


def _build_action_explanation(action_type: str, *, index: int, total: int) -> str:
    return (
        f"Execute OpenAI native computer action {index}/{total}: {action_type}."
    )


def _format_system_state_xml(system_state: dict[str, Any]) -> str:
    active_window = system_state.get("active_window", "Unknown")
    mouse_position = system_state.get("mouse_position", {})
    mouse_x = mouse_position.get("x", 0) if isinstance(mouse_position, dict) else 0
    mouse_y = mouse_position.get("y", 0) if isinstance(mouse_position, dict) else 0
    time_value = system_state.get("time", "Unknown")
    return f"""<os_state>
<active_window>{active_window}</active_window>
<mouse_position>
  <x>{mouse_x}</x>
  <y>{mouse_y}</y>
</mouse_position>
<time>{time_value}</time>
</os_state>"""


def _format_bundle_result_for_history(
    bundle_data: dict[str, Any],
    *,
    error: str | None,
) -> str:
    status = bundle_data.get("status", "unknown")
    step_results = bundle_data.get("step_results", [])
    screenshot = bundle_data.get("screenshot")
    screenshot_ref = bundle_data.get("screenshot_ref")
    system_state = bundle_data.get("system_state")

    parts: list[str] = []
    if status == "success":
        parts.append("Bundled tool sequence executed successfully:")
    elif status == "partial_failure":
        parts.append("Bundled tool sequence executed with partial failures:")
    else:
        parts.append("Bundled tool sequence failed:")

    for index, step in enumerate(step_results, start=1):
        if not isinstance(step, dict):
            continue
        tool_name = step.get("tool", "unknown")
        step_status = step.get("status", "unknown")
        output = step.get("output", "")
        if step_status == "ok":
            parts.append(f"{index}. {tool_name}: {output}")
        else:
            parts.append(f"{index}. {tool_name}: FAILED - {output}")

    if error:
        parts.append(f"Error: {error}")
    if isinstance(system_state, dict):
        parts.append("\n" + _format_system_state_xml(system_state))
    if screenshot or screenshot_ref:
        parts.append("\n[Screenshot captured after bundle execution]")
    return "\n".join(parts)


def _require_int(value: Any, *, field_name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value))
    raise ValueError(f"{field_name} must be an integer")


def _require_float(value: Any, *, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be numeric")
    return float(value)


def _get_action_payload_value(
    action_payload: dict[str, Any],
    *field_names: str,
    default: Any = None,
) -> Any:
    for field_name in field_names:
        if field_name in action_payload:
            return action_payload[field_name]
    return default


def _resolve_mouse_button(action_payload: dict[str, Any]) -> str:
    button = action_payload.get("button")
    if not isinstance(button, str) or button not in {"left", "right", "middle"}:
        return "left"
    return button


def _reject_mouse_modifiers(action_payload: dict[str, Any]) -> None:
    keys = action_payload.get("keys")
    if isinstance(keys, list) and keys:
        raise ValueError(
            "Modifier keys on native computer mouse actions are not supported yet."
        )


def _translate_computer_action(
    action_payload: dict[str, Any],
    *,
    index: int,
    total: int,
) -> list[dict[str, Any]]:
    action_type = str(action_payload.get("type") or "").strip()
    if not action_type:
        raise ValueError("computer action is missing type")

    explanation = _build_action_explanation(action_type, index=index, total=total)

    if action_type in {"click", "double_click", "move"}:
        _reject_mouse_modifiers(action_payload)
        return [
            _tool_step(
                name="mouse_control",
                args={
                    "action": action_type,
                    "x": _require_int(action_payload.get("x"), field_name="x"),
                    "y": _require_int(action_payload.get("y"), field_name="y"),
                    "button": _resolve_mouse_button(action_payload),
                    "explanation": explanation,
                },
                action_payload=action_payload,
            )
        ]

    if action_type == "drag":
        _reject_mouse_modifiers(action_payload)
        path = action_payload.get("path")
        if not isinstance(path, list) or len(path) < 2:
            raise ValueError("drag action requires a path with at least two points")
        first_point = path[0]
        last_point = path[-1]
        if not isinstance(first_point, dict) or not isinstance(last_point, dict):
            raise ValueError("drag path points must be objects with x and y")
        return [
            _tool_step(
                name="mouse_control",
                args={
                    "action": "drag",
                    "x": _require_int(first_point.get("x"), field_name="path[0].x"),
                    "y": _require_int(first_point.get("y"), field_name="path[0].y"),
                    "drag_to_x": _require_int(last_point.get("x"), field_name="path[-1].x"),
                    "drag_to_y": _require_int(last_point.get("y"), field_name="path[-1].y"),
                    "button": "left",
                    "duration": 0.5,
                    "explanation": explanation,
                },
                action_payload=action_payload,
            )
        ]

    if action_type == "scroll":
        _reject_mouse_modifiers(action_payload)
        # OpenAI's Python SDK exposes native computer scroll fields as snake_case
        # (`scroll_y`/`scroll_x`), while some upstream payloads may still be camelCase.
        scroll_y = _require_float(
            _get_action_payload_value(action_payload, "scrollY", "scroll_y", default=0),
            field_name="scrollY",
        )
        scroll_x = _require_float(
            _get_action_payload_value(action_payload, "scrollX", "scroll_x", default=0),
            field_name="scrollX",
        )
        if abs(scroll_x) > abs(scroll_y):
            raise ValueError("Horizontal native computer scroll is not supported yet.")
        if scroll_y == 0:
            raise ValueError("scroll action requires a non-zero scrollY value")
        return [
            _tool_step(
                name="scroll_control",
                args={
                    "action": "scroll",
                    "x": _require_int(action_payload.get("x"), field_name="x"),
                    "y": _require_int(action_payload.get("y"), field_name="y"),
                    "direction": "down" if scroll_y > 0 else "up",
                    "clicks": max(1, int(round(abs(scroll_y) / 100))),
                    "explanation": explanation,
                },
                action_payload=action_payload,
            )
        ]

    if action_type == "keypress":
        keys = action_payload.get("keys")
        if not isinstance(keys, list) or not keys:
            raise ValueError("keypress action requires a non-empty keys array")
        normalized_keys = [str(key) for key in keys if str(key).strip()]
        if not normalized_keys:
            raise ValueError("keypress action requires non-empty key names")
        if len(normalized_keys) == 1:
            args = {
                "action": "press",
                "key": normalized_keys[0],
                "explanation": explanation,
            }
        else:
            args = {
                "action": "hotkey",
                "keys": normalized_keys,
                "explanation": explanation,
            }
        return [_tool_step(name="keyboard_control", args=args, action_payload=action_payload)]

    if action_type == "type":
        text = action_payload.get("text")
        if not isinstance(text, str) or not text:
            raise ValueError("type action requires text")
        return [
            _tool_step(
                name="keyboard_control",
                args={
                    "action": "type",
                    "text": text,
                    "explanation": explanation,
                },
                action_payload=action_payload,
            )
        ]

    if action_type == "wait":
        seconds = action_payload.get("seconds")
        if seconds is None:
            seconds = action_payload.get("duration", 2.0)
        return [
            _tool_step(
                name="wait",
                args={
                    "seconds": max(0.0, _require_float(seconds, field_name="seconds")),
                    "explanation": explanation,
                },
                action_payload=action_payload,
            )
        ]

    if action_type == "screenshot":
        return [
            _tool_step(
                name="screenshot",
                args={"explanation": explanation},
                action_payload=action_payload,
            )
        ]

    raise ValueError(f"Unsupported native computer action: {action_type}")


def _translate_computer_actions(
    actions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    translated: list[dict[str, Any]] = []
    total = len(actions)
    for index, action_payload in enumerate(actions, start=1):
        if not isinstance(action_payload, dict):
            raise ValueError("computer actions must be objects")
        translated.extend(
            _translate_computer_action(
                action_payload,
                index=index,
                total=total,
            )
        )
    return translated


def _translated_steps_to_timeout_calls(
    translated_steps: list[dict[str, Any]],
) -> list[ParsedToolCall]:
    parsed_calls: list[ParsedToolCall] = []
    for step in translated_steps:
        tool_name = step.get("name")
        parameters = step.get("args")
        if not isinstance(tool_name, str) or not isinstance(parameters, dict):
            continue
        parsed_calls.append(
            ParsedToolCall(
                tool_name=tool_name,
                parameters=dict(parameters),
                metadata=step.get("metadata"),
            )
        )
    return parsed_calls


class OpenAINativeComputerTool(Tool[OpenAIComputerArgs]):
    name = "computer"
    description = "Internal OpenAI native computer bridge."
    args_model = OpenAIComputerArgs
    category = ToolDomain.COMPUTER
    execution_target = "backend"

    async def run(self, args: OpenAIComputerArgs, ctx: ToolContext) -> ToolResult:
        session = ctx.services.get("session")
        emit_streaming_event = ctx.services.get("emit_streaming_event")
        if session is None:
            error = "Session service is unavailable for native computer execution."
            return ToolResult(success=False, error=error, llm_content=f"Error: {error}")
        if not callable(emit_streaming_event):
            error = "Streaming event emitter is unavailable for native computer execution."
            return ToolResult(success=False, error=error, llm_content=f"Error: {error}")

        try:
            translated_steps = _translate_computer_actions(args.actions)
        except Exception as exc:
            error = str(exc) or "Failed to translate native computer actions."
            return ToolResult(success=False, error=error, llm_content=f"Error: {error}")

        bundle_id = str(uuid.uuid4())
        result_storage = session.get_result_storage()
        bundle_future = result_storage.create_bundle_future(bundle_id)

        try:
            await emit_streaming_event(
                ToolBundleEvent(bundle_id=bundle_id, tools=translated_steps)
            )

            bundle_result = result_storage.get_bundled_result(bundle_id)
            if bundle_result is None:
                timeout_seconds = resolve_bundle_wait_timeout_seconds(
                    _translated_steps_to_timeout_calls(translated_steps)
                )
                bundle_result = await asyncio.wait_for(
                    bundle_future,
                    timeout=timeout_seconds,
                )
        except asyncio.TimeoutError:
            error = "Timed out waiting for native computer bundle execution on frontend."
            return ToolResult(success=False, error=error, llm_content=f"Error: {error}")
        finally:
            result_storage.remove_bundle_future(bundle_id)

        bundle_data = (
            dict(bundle_result.data)
            if isinstance(bundle_result.data, dict)
            else {}
        )
        if result_storage.get_bundled_result(bundle_id) is not None:
            result_storage.remove_bundled_result(bundle_id)

        formatted_message = _format_bundle_result_for_history(
            {
                "bundle_id": bundle_id,
                "status": bundle_data.get(
                    "status",
                    "success" if bundle_result.success else "failure",
                ),
                "step_results": bundle_data.get("step_results", []),
                "screenshot": bundle_data.get("screenshot"),
                "screenshot_ref": bundle_data.get("screenshot_ref"),
                "system_state": bundle_data.get("system_state"),
            },
            error=bundle_result.error,
        )
        result_metadata = dict(bundle_result.metadata or {})
        result_metadata.update(
            {
                "suppress_wrapper_events": True,
                "provider_native_computer": True,
            }
        )
        return ToolResult(
            success=bundle_result.success,
            data=bundle_data or bundle_result.data,
            error=bundle_result.error,
            metadata=result_metadata,
            llm_content=formatted_message,
            return_display=formatted_message,
            artifacts=bundle_result.artifacts,
            compaction_facts=bundle_result.compaction_facts,
        )


_COMPUTER_USE_MODEL_BY_TOOL = {
    "mouse_control": RemoteMouseTool.args_model,
    "keyboard_control": RemoteKeyboardTool.args_model,
    "screenshot": RemoteScreenshotTool.args_model,
    "scroll_control": RemoteScrollTool.args_model,
    "switch_window": RemoteSwitchTabTool.args_model,
    "wait": RemoteWaitTool.args_model,
}
