"""Canonical unified computer-use function declaration schema."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict


_COMPUTER_USE_FUNCTION_DECLARATION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "computer_use",
        "description": (
            "Unified computer-use tool.\n\n"
            "Use this tool to control a remote desktop style UI with keyboard, mouse, scrolling, "
            "window focus, and screenshots.\n\n"
            "Core contract:\n"
            "- Select a concrete action via `tool`.\n"
            "- Pass action arguments via `arguments`.\n"
            "- Always include required `metadata` fields: `description`, `explanation`, "
            "`expectation`.\n\n"
            "Grounding rules:\n"
            "- Prefer keyboard shortcuts and app-native navigation over mouse when equivalent.\n"
            "- For text-labeled targets, use mouse `find_coordinates_by='ocr'` with exact "
            "`ocr_text` first.\n"
            "- If OCR returns multiple matches, retry with `candidate_id` from the ambiguity "
            "response.\n"
            "- For non-text targets, use `find_coordinates_by='prediction'` with a detailed "
            "visual description.\n"
            "- For manual coordinates, use screenshot pixel coordinates from the latest screenshot "
            "and treat the visible cursor position as a spatial reference.\n"
            "- Do not treat tool execution status alone as success. Verify the expected UI change "
            "via the tool's always-on post-action screenshot.\n\n"
            "Timing rules:\n"
            "- Most actions support `wait` to delay before the automatic post-action screenshot "
            "capture.\n"
            "- Use `wait` when you expect animations, loading spinners, or async UI updates.\n\n"
            "Tools supported:\n"
            "- mouse_control: click, move, drag, scroll with OCR, prediction, or manual "
            "targeting.\n"
            "- keyboard_control: type, paste, press, hotkey.\n"
            "- screenshot: capture the screen.\n"
            "- scroll_control: scroll up/down/left/right, optionally moving to x/y first.\n"
            "- switch_tab: focus a window/tab by title.\n"
            "- wait: pause for seconds and capture state.\n"
        ),
        "parameters": {
            "type": "object",
            "description": (
                "Unified computer-use tool envelope. `tool` selects a concrete action. "
                "`arguments` must match that action's schema. `metadata` is always required."
            ),
            "required": ["tool", "metadata"],
            "properties": {
                "tool": {
                    "type": "string",
                    "description": "Concrete computer-use action to execute.",
                    "enum": [
                        "mouse_control",
                        "keyboard_control",
                        "screenshot",
                        "scroll_control",
                        "switch_tab",
                        "wait",
                    ],
                },
                "metadata": {
                    "type": "object",
                    "description": "Required execution rationale metadata for computer-use actions.",
                    "required": ["description", "explanation", "expectation"],
                    "properties": {
                        "description": {
                            "type": "string",
                            "minLength": 1,
                            "description": "Current observed UI or screen state before the action.",
                        },
                        "explanation": {
                            "type": "string",
                            "minLength": 1,
                            "description": (
                                "Why this action is needed to achieve the immediate goal."
                            ),
                        },
                        "expectation": {
                            "type": "string",
                            "minLength": 1,
                            "description": "Expected UI or screen state after the action.",
                        },
                    },
                },
                "arguments": {
                    "type": "object",
                    "description": (
                        "Arguments for the selected `tool` action. Must match the corresponding "
                        "action schema."
                    ),
                    "oneOf": [
                        {
                            "title": "mouse_control arguments",
                            "type": "object",
                            "required": ["action"],
                            "properties": {
                                "action": {
                                    "type": "string",
                                    "description": (
                                        "Mouse action to perform. Prefer keyboard shortcuts when "
                                        "equivalent. Always verify UI state change after."
                                    ),
                                    "enum": [
                                        "click",
                                        "double_click",
                                        "right_click",
                                        "move",
                                        "drag",
                                        "scroll",
                                    ],
                                },
                                "find_coordinates_by": {
                                    "type": "string",
                                    "description": (
                                        "Coordinate targeting strategy. Use 'ocr' for visible text "
                                        "targets, 'prediction' for icons and non-text targets, "
                                        "'manual' only when you have reliable coordinates from the "
                                        "latest screenshot."
                                    ),
                                    "default": "manual",
                                    "enum": ["manual", "ocr", "prediction"],
                                },
                                "x": {
                                    "type": "integer",
                                    "description": (
                                        "X coordinate in screenshot pixels. Required when "
                                        "find_coordinates_by='manual'."
                                    ),
                                },
                                "y": {
                                    "type": "integer",
                                    "description": (
                                        "Y coordinate in screenshot pixels. Required when "
                                        "find_coordinates_by='manual'."
                                    ),
                                },
                                "ocr_text": {
                                    "type": "string",
                                    "description": (
                                        "Exact visible on-screen text for OCR targeting. Required "
                                        "when find_coordinates_by='ocr' unless candidate_id is "
                                        "provided. Keep to one line."
                                    ),
                                },
                                "candidate_id": {
                                    "type": "string",
                                    "description": (
                                        "Stable OCR candidate id from an earlier ambiguity "
                                        "response. Use for deterministic follow-up selection when "
                                        "multiple OCR matches exist."
                                    ),
                                },
                                "description": {
                                    "type": "string",
                                    "description": (
                                        "Detailed visual description for "
                                        "find_coordinates_by='prediction'. Describe shape, icon, "
                                        "color, and relative position. Do not combine with "
                                        "ocr_text."
                                    ),
                                },
                                "model_name": {
                                    "type": "string",
                                    "description": (
                                        "Optional vision model name to use for prediction grounding."
                                    ),
                                },
                                "button": {
                                    "type": "string",
                                    "description": "Mouse button for click actions.",
                                    "default": "left",
                                    "enum": ["left", "right", "middle"],
                                },
                                "drag_to_x": {
                                    "type": "integer",
                                    "description": (
                                        "Destination X for drag. Required when action='drag' in "
                                        "manual mode."
                                    ),
                                },
                                "drag_to_y": {
                                    "type": "integer",
                                    "description": (
                                        "Destination Y for drag. Required when action='drag' in "
                                        "manual mode."
                                    ),
                                },
                                "duration": {
                                    "type": "number",
                                    "description": "Duration in seconds for drag operations.",
                                    "default": 0.5,
                                    "minimum": 0,
                                },
                                "scroll_amount": {
                                    "type": "integer",
                                    "description": (
                                        "Amount to scroll. Positive scrolls down or right, negative "
                                        "scrolls up or left. Required when action='scroll' unless "
                                        "clicks is used."
                                    ),
                                    "minimum": -5000,
                                    "maximum": 5000,
                                },
                                "scroll_direction": {
                                    "type": "string",
                                    "description": "Scroll axis for mouse scroll action.",
                                    "default": "vertical",
                                    "enum": ["vertical", "horizontal"],
                                },
                                "clicks": {
                                    "type": "integer",
                                    "description": (
                                        "Scroll step count. Positive moves up or right, negative "
                                        "moves down or left. Alternative to scroll_amount."
                                    ),
                                    "default": 5,
                                },
                                "wait": {
                                    "type": "number",
                                    "description": (
                                        "Delay in seconds before the automatic post-action screenshot "
                                        "capture."
                                    ),
                                    "default": 0,
                                    "minimum": 0,
                                    "maximum": 60,
                                },
                            },
                            "allOf": [
                                {
                                    "if": {
                                        "properties": {
                                            "find_coordinates_by": {"const": "manual"}
                                        },
                                        "required": ["find_coordinates_by"],
                                    },
                                    "then": {"required": ["x", "y"]},
                                },
                                {
                                    "if": {
                                        "properties": {"find_coordinates_by": {"const": "ocr"}},
                                        "required": ["find_coordinates_by"],
                                    },
                                    "then": {
                                        "anyOf": [
                                            {"required": ["ocr_text"]},
                                            {"required": ["candidate_id"]},
                                        ]
                                    },
                                },
                                {
                                    "if": {
                                        "properties": {
                                            "find_coordinates_by": {"const": "prediction"}
                                        },
                                        "required": ["find_coordinates_by"],
                                    },
                                    "then": {"required": ["description"]},
                                },
                                {
                                    "if": {
                                        "properties": {"action": {"const": "drag"}},
                                        "required": ["action"],
                                    },
                                    "then": {
                                        "anyOf": [
                                            {"required": ["drag_to_x", "drag_to_y"]},
                                            {"required": ["description"]},
                                        ]
                                    },
                                },
                                {
                                    "if": {
                                        "properties": {"action": {"const": "scroll"}},
                                        "required": ["action"],
                                    },
                                    "then": {
                                        "anyOf": [
                                            {"required": ["scroll_amount"]},
                                            {"required": ["clicks"]},
                                        ]
                                    },
                                },
                            ],
                        },
                        {
                            "title": "keyboard_control arguments",
                            "type": "object",
                            "required": ["action"],
                            "properties": {
                                "action": {
                                    "type": "string",
                                    "description": (
                                        "Keyboard action to perform. Use type for normal entry, "
                                        "paste as fallback when type fails, press for a single key, "
                                        "hotkey for combos."
                                    ),
                                    "enum": ["type", "paste", "press", "hotkey"],
                                },
                                "text": {
                                    "type": "string",
                                    "description": (
                                        "Text for action='type' or action='paste'. Verify text "
                                        "appears in UI after input."
                                    ),
                                    "maxLength": 10000,
                                },
                                "key": {
                                    "type": "string",
                                    "description": (
                                        "Single key for action='press' such as enter, esc, tab, "
                                        "backspace."
                                    ),
                                },
                                "keys": {
                                    "type": "array",
                                    "description": (
                                        "Ordered key list for action='hotkey', for example "
                                        "['ctrl','l'] or ['cmd','shift','p']."
                                    ),
                                    "items": {"type": "string"},
                                    "minItems": 2,
                                },
                                "repeat": {
                                    "type": "integer",
                                    "description": "Repeat count for press or hotkey.",
                                    "default": 1,
                                    "minimum": 1,
                                    "maximum": 50,
                                },
                                "interval_ms": {
                                    "type": "integer",
                                    "description": "Delay between repeats in milliseconds.",
                                    "default": 0,
                                    "minimum": 0,
                                    "maximum": 2000,
                                },
                                "wait": {
                                    "type": "number",
                                    "description": (
                                        "Delay in seconds before the automatic post-action screenshot "
                                        "capture."
                                    ),
                                    "default": 0,
                                    "minimum": 0,
                                    "maximum": 60,
                                },
                            },
                            "allOf": [
                                {
                                    "if": {
                                        "properties": {"action": {"const": "type"}},
                                        "required": ["action"],
                                    },
                                    "then": {"required": ["text"]},
                                },
                                {
                                    "if": {
                                        "properties": {"action": {"const": "paste"}},
                                        "required": ["action"],
                                    },
                                    "then": {"required": ["text"]},
                                },
                                {
                                    "if": {
                                        "properties": {"action": {"const": "press"}},
                                        "required": ["action"],
                                    },
                                    "then": {"required": ["key"]},
                                },
                                {
                                    "if": {
                                        "properties": {"action": {"const": "hotkey"}},
                                        "required": ["action"],
                                    },
                                    "then": {"required": ["keys"]},
                                },
                            ],
                        },
                        {
                            "title": "screenshot arguments",
                            "type": "object",
                            "properties": {
                                "wait": {
                                    "type": "number",
                                    "description": (
                                        "Optional delay in seconds before capturing a screenshot."
                                    ),
                                    "minimum": 0,
                                    "maximum": 60,
                                }
                            },
                        },
                        {
                            "title": "scroll_control arguments",
                            "type": "object",
                            "required": ["action"],
                            "properties": {
                                "action": {
                                    "type": "string",
                                    "description": "Scroll action to perform.",
                                    "enum": [
                                        "scroll",
                                        "scroll_up",
                                        "scroll_down",
                                        "scroll_left",
                                        "scroll_right",
                                    ],
                                },
                                "find_coordinates_by": {
                                    "type": "string",
                                    "description": (
                                        "How to select the scroll focus point. Use manual x/y when "
                                        "you know the scrollable region. Use OCR to move over a "
                                        "labeled scroll container if needed."
                                    ),
                                    "default": "manual",
                                    "enum": ["manual", "ocr", "prediction"],
                                },
                                "x": {
                                    "type": "integer",
                                    "description": (
                                        "Screen X coordinate to move to before scrolling. Required "
                                        "when find_coordinates_by='manual'."
                                    ),
                                },
                                "y": {
                                    "type": "integer",
                                    "description": (
                                        "Screen Y coordinate to move to before scrolling. Required "
                                        "when find_coordinates_by='manual'."
                                    ),
                                },
                                "ocr_text": {
                                    "type": "string",
                                    "description": (
                                        "Exact visible on-screen text to locate a scrollable region "
                                        "via OCR."
                                    ),
                                },
                                "candidate_id": {
                                    "type": "string",
                                    "description": (
                                        "Stable OCR candidate id from a prior ambiguity response."
                                    ),
                                },
                                "description": {
                                    "type": "string",
                                    "description": (
                                        "Prediction description to locate a scrollable region when "
                                        "it is not text-labeled."
                                    ),
                                },
                                "direction": {
                                    "type": "string",
                                    "description": (
                                        "Direction for action='scroll'. Required when action is "
                                        "'scroll'."
                                    ),
                                    "enum": ["up", "down", "left", "right"],
                                },
                                "clicks": {
                                    "type": "integer",
                                    "description": (
                                        "Scroll click count. Positive moves up/left, negative moves "
                                        "down/right when using direction. If you prefer absolute, "
                                        "use amount."
                                    ),
                                    "default": 5,
                                },
                                "amount": {
                                    "type": "integer",
                                    "description": (
                                        "Scroll amount in pixels-like units. Use when you want more "
                                        "consistent magnitude than clicks."
                                    ),
                                    "minimum": 100,
                                    "maximum": 5000,
                                },
                                "wait": {
                                    "type": "number",
                                    "description": (
                                        "Delay in seconds before the automatic post-action screenshot "
                                        "capture."
                                    ),
                                    "default": 0,
                                    "minimum": 0,
                                    "maximum": 60,
                                },
                            },
                            "allOf": [
                                {
                                    "if": {
                                        "properties": {
                                            "find_coordinates_by": {"const": "manual"}
                                        },
                                        "required": ["find_coordinates_by"],
                                    },
                                    "then": {"required": ["x", "y"]},
                                },
                                {
                                    "if": {
                                        "properties": {"find_coordinates_by": {"const": "ocr"}},
                                        "required": ["find_coordinates_by"],
                                    },
                                    "then": {
                                        "anyOf": [
                                            {"required": ["ocr_text"]},
                                            {"required": ["candidate_id"]},
                                        ]
                                    },
                                },
                                {
                                    "if": {
                                        "properties": {
                                            "find_coordinates_by": {"const": "prediction"}
                                        },
                                        "required": ["find_coordinates_by"],
                                    },
                                    "then": {"required": ["description"]},
                                },
                                {
                                    "if": {
                                        "properties": {"action": {"const": "scroll"}},
                                        "required": ["action"],
                                    },
                                    "then": {"required": ["direction"]},
                                },
                            ],
                        },
                        {
                            "title": "switch_tab arguments",
                            "type": "object",
                            "required": ["tab_name"],
                            "properties": {
                                "tab_name": {
                                    "type": "string",
                                    "description": (
                                        "Exact window or tab title to focus, matching the system's "
                                        "open-window list output exactly."
                                    ),
                                },
                                "match_mode": {
                                    "type": "string",
                                    "description": (
                                        "How to match tab_name against open window titles."
                                    ),
                                    "default": "exact",
                                    "enum": ["exact", "contains", "regex"],
                                },
                                "wait": {
                                    "type": "number",
                                    "description": (
                                        "Delay in seconds before the automatic post-action screenshot "
                                        "capture."
                                    ),
                                    "default": 0,
                                    "minimum": 0,
                                    "maximum": 60,
                                },
                            },
                        },
                        {
                            "title": "wait arguments",
                            "type": "object",
                            "required": ["seconds"],
                            "properties": {
                                "seconds": {
                                    "type": "number",
                                    "description": (
                                        "Number of seconds to wait before capturing a screenshot."
                                    ),
                                    "minimum": 0,
                                    "maximum": 60,
                                }
                            },
                        },
                    ],
                },
            },
        },
    },
}


def get_unified_computer_use_function_declaration() -> Dict[str, Any]:
    """Return the canonical unified computer-use function declaration schema."""
    return deepcopy(_COMPUTER_USE_FUNCTION_DECLARATION)

