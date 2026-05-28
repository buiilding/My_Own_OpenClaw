"""Sidecar-owned schema export for local built-in tools."""

from __future__ import annotations

import copy
from typing import Any

from windie_shared.browser_contract import build_browser_tool_parameters_schema
from tools.schemas import (
    GetOpenWindowsArgs,
    GetSystemStatsArgs,
    KeyboardControlArgs,
    MouseControlArgs,
    OpenAppArgs,
    ProcessShellCommandArgs,
    ReadFileArgs,
    ReplaceArgs,
    RunShellCommandArgs,
    ScreenshotToolArgs,
    ScrollControlArgs,
    SwitchTabArgs,
    WaitToolArgs,
)

TOOL_DESCRIPTIONS = {
    "mouse_control": "Control mouse actions with schema-guided coordinate targeting.",
    "keyboard_control": (
        "Control keyboard input including typing text, clipboard paste, pressing keys, and shortcuts. "
        "After input, verify text appears in the latest captured screen image; do not assume tool success means input landed. "
        "If text is missing, refocus the field and retry. "
        "Use deterministic action sequences for predictable flows (for example, input text then press Enter only when submit is intended). "
        "Prefer this tool over mouse clicks when a shortcut or key-driven path exists."
    ),
    "screenshot": "Capture a screenshot of the current computer screen.",
    "scroll_control": (
        "Control desktop scrolling actions. Target the scroll region using the currently enabled "
        "grounding fields exposed by this schema. Prefer 'manual' as it's less compute-heavy. "
        "Omit `clicks` on the first vertical scroll attempt so the executor uses its default "
        "click amount; use `clicks` only for follow-up fine tuning."
    ),
    "switch_window": (
        "Switch focus to a specific window by exact title. Use an exact known window title rather than blind OS-level cycling."
    ),
    "wait": (
        "Wait for a specified number of seconds, then capture a fresh image of the current "
        "screen state. Useful for waiting for UI changes, animations, page loads, or async "
        "operations to complete. After execution, returns a status message and the captured image."
    ),
    "get_open_windows": (
        "Lists currently open windows that exist on the desktop and can be focused. "
        "Use it to discover candidate windows before assuming shortcuts, clicking, or typing "
        "will land in the intended place."
    ),
    "get_system_stats": (
        "Returns current system resource usage (CPU %, Memory %, Battery). "
        "Use this to check system performance before running resource-intensive operations."
    ),
    "open_app": (
        "Launch a GUI app detached from sidecar/agent lifecycle so the app remains running even if "
        "the current agent turn or sidecar process ends.\n\n"
        "Verification modes:\n"
        "- window (default): polls open windows for expected title.\n"
        "- screenshot: captures visual proof after launch and returns capture artifact fields.\n"
        "- none: fastest acknowledgment without verification.\n\n"
        "Use this for open-and-leave-running app workflows."
    ),
    "run_shell_command": (
        "This tool executes shell commands on the local system. "
        "Commands are executed in the specified directory (or the user-selected WindieOS workspace folder "
        "when configured, otherwise the OS user home directory if not specified).\n\n"
        "Execution Modes:\n"
        "- Foreground (run_in_background=False): Blocks until command completion and returns output. "
        "Use terminate_after_seconds to set a timeout (default 120 seconds). If timeout is reached, "
        "the command is terminated and current output is returned. Backend-owned history projection handles "
        "any model-facing truncation.\n"
        "- Background (run_in_background=True): Starts the command and returns immediately with execution confirmation. "
        "Does not block for output or completion.\n"
        "- Yield (yield_after_seconds): Returns early if the command runs longer than the yield time; "
        "the command continues in the background and can be managed through the returned session.\n\n"
        "Operational Guidance:\n"
        "- Prefer short commands focused on one step per tool call.\n"
        "- Do not embed large inline file content (HTML/JSON/source blobs) directly in shell command arguments.\n"
        "- For creating or updating file contents, prefer dedicated file-edit capabilities before running shell commands.\n"
        "- Split large workflows into multiple tool calls rather than one giant command payload.\n"
        "- For detached GUI app launches, prefer the dedicated app-launch capability when appropriate.\n"
        "- For shell jobs you need to poll or terminate, keep run_in_background=True and manage through the returned session.\n"
        "- After launch, capture a delayed screen image when visual verification matters.\n"
        "- Use exact known window titles and deterministic focus checks when window targeting matters.\n\n"
        "Optional post-execution delay: when provided, the tool pauses for that many seconds and captures a screen image "
        "after execution. This is useful when the command opens a GUI application "
        "or makes visual changes that need to be captured.\n\n"
        "Returns: Command output, exit code, execution time, and any errors."
    ),
    "process": (
        "Manage background shell command sessions: "
        "list, poll, log, write, send-keys, submit, paste, kill, clear, remove."
    ),
    "read_file": "Read file contents. Use this tool to examine existing files.",
    "replace": (
        "Replace text in a file using exact or context-anchored matching. Supports "
        "single edits and batched replacements.\n\n"
        "Operational Guidance:\n"
        "- Prefer focused edits per tool call.\n"
        "- Do not send giant new_string payloads in one call.\n"
        "- For large changes, split them into multiple focused edit calls section-by-section."
    ),
    "browser": (
        "Control the WindieOS browser instance for navigation, extraction, page "
        "interaction, tab management, and screenshots."
    ),
}

GROUNDING_ARGUMENT_RESOLUTION_TOOLS = frozenset({"mouse_control", "scroll_control"})

SOURCE_GROUNDING_PROPERTIES = {
    "find_coordinates_by": {
        "type": "string",
        "description": "Coordinate targeting method.",
        "default": "manual",
        "enum": ["manual", "ocr", "prediction"],
    },
    "x": {
        "type": "integer",
        "description": (
            "X coordinate in captured-image pixels. Required when find_coordinates_by='manual'. "
            "Beware of the mouse position on the image when determining manual coordinates."
        ),
    },
    "y": {
        "type": "integer",
        "description": (
            "Y coordinate in captured-image pixels. Required when find_coordinates_by='manual'. "
            "Beware of the mouse position on the image when determining manual coordinates."
        ),
    },
    "ocr_text": {
        "type": "string",
        "description": "Exact visible on-screen text for OCR targeting.",
    },
    "candidate_id": {
        "type": "string",
        "description": "Stable OCR candidate id from an earlier ambiguity response.",
    },
    "source_description": {
        "type": "string",
        "description": "Detailed visual description of the source target for prediction targeting.",
    },
    "model_name": {
        "type": "string",
        "description": "Optional specific vision model for prediction targeting.",
    },
}

DRAG_DESTINATION_GROUNDING_PROPERTIES = {
    "drag_to_x": {
        "type": "integer",
        "description": (
            "Destination X coordinate in captured-image pixels for drag actions. "
            "Required when drag_to_find_coordinates_by='manual'."
        ),
    },
    "drag_to_y": {
        "type": "integer",
        "description": (
            "Destination Y coordinate in captured-image pixels for drag actions. "
            "Required when drag_to_find_coordinates_by='manual'."
        ),
    },
    "drag_to_find_coordinates_by": {
        "type": "string",
        "description": "Drag destination targeting method.",
        "default": "manual",
        "enum": ["manual", "ocr", "prediction"],
    },
    "drag_to_ocr_text": {
        "type": "string",
        "description": "Exact visible on-screen text for drag destination OCR targeting.",
    },
    "drag_to_candidate_id": {
        "type": "string",
        "description": "Stable OCR candidate id for drag destination targeting.",
    },
    "destination_description": {
        "type": "string",
        "description": "Detailed visual description of the drag destination for prediction targeting.",
    },
    "drag_to_model_name": {
        "type": "string",
        "description": "Optional specific vision model for drag destination prediction.",
    },
}

TOOL_SCHEMA_MODELS = {
    "mouse_control": MouseControlArgs,
    "keyboard_control": KeyboardControlArgs,
    "screenshot": ScreenshotToolArgs,
    "scroll_control": ScrollControlArgs,
    "switch_window": SwitchTabArgs,
    "wait": WaitToolArgs,
    "get_open_windows": GetOpenWindowsArgs,
    "get_system_stats": GetSystemStatsArgs,
    "open_app": OpenAppArgs,
    "run_shell_command": RunShellCommandArgs,
    "process": ProcessShellCommandArgs,
    "read_file": ReadFileArgs,
    "replace": ReplaceArgs,
}

BUILTIN_TOOL_ORDER = (
    "mouse_control",
    "keyboard_control",
    "screenshot",
    "scroll_control",
    "switch_window",
    "wait",
    "get_open_windows",
    "get_system_stats",
    "open_app",
    "run_shell_command",
    "process",
    "read_file",
    "replace",
    "browser",
)


def _clean_schema(schema: Any) -> Any:
    if isinstance(schema, list):
        return [_clean_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    cleaned: dict[str, Any] = {}
    for key, value in schema.items():
        if key in {"title", "$defs"}:
            continue
        if key == "$ref":
            continue
        if key == "anyOf":
            non_null = (
                [
                    item
                    for item in value
                    if isinstance(item, dict) and item.get("type") != "null"
                ]
                if isinstance(value, list)
                else []
            )
            if len(non_null) == 1:
                cleaned.update(_clean_schema(non_null[0]))
            else:
                cleaned[key] = _clean_schema(value)
            continue
        cleaned[key] = _clean_schema(value)
    return cleaned


def _apply_backend_grounding_capability_metadata(
    tool_name: str, schema: dict[str, Any]
) -> dict[str, Any]:
    updated = copy.deepcopy(schema)
    properties = updated.setdefault("properties", {})
    if tool_name in GROUNDING_ARGUMENT_RESOLUTION_TOOLS:
        properties.update(copy.deepcopy(SOURCE_GROUNDING_PROPERTIES))
        updated["required"] = [
            field for field in updated.get("required", []) if field not in {"x", "y"}
        ]
        for required_field in ("action", "explanation"):
            if required_field not in updated["required"]:
                updated["required"].append(required_field)
    if tool_name == "mouse_control":
        properties.update(copy.deepcopy(DRAG_DESTINATION_GROUNDING_PROPERTIES))
    return updated


def build_sidecar_executable_schema(tool_name: str) -> dict[str, Any] | None:
    if tool_name == "browser":
        return build_browser_tool_parameters_schema()
    model = TOOL_SCHEMA_MODELS.get(tool_name)
    if model is None:
        return None
    schema = _clean_schema(model.model_json_schema())
    schema.setdefault("type", "object")
    return schema


def build_sidecar_capability_schema(tool_name: str) -> dict[str, Any] | None:
    """Return the backend-validation schema advertised in the client manifest."""
    schema = build_sidecar_executable_schema(tool_name)
    if schema is None:
        return None
    return _apply_backend_grounding_capability_metadata(tool_name, schema)


def build_sidecar_tool_manifest(
    tool_names: set[str] | list[str],
) -> dict[str, Any]:
    tools = []
    requested_names = set(tool_names)
    ordered_tool_names = [
        *[
            tool_name
            for tool_name in BUILTIN_TOOL_ORDER
            if tool_name in requested_names
        ],
        *sorted(requested_names - set(BUILTIN_TOOL_ORDER)),
    ]
    for tool_name in ordered_tool_names:
        executable_schema = build_sidecar_executable_schema(tool_name)
        schema = build_sidecar_capability_schema(tool_name)
        if executable_schema is None or schema is None:
            continue
        tools.append(
            {
                "name": tool_name,
                "description": TOOL_DESCRIPTIONS.get(tool_name, ""),
                "execution_target": "sidecar",
                "schema": schema,
                "schema_role": "backend_validation",
                "executable_schema": executable_schema,
                "argument_resolution": (
                    "backend_grounding"
                    if tool_name in GROUNDING_ARGUMENT_RESOLUTION_TOOLS
                    else "passthrough"
                ),
            }
        )
    return {
        "version": 1,
        "tools": tools,
    }
