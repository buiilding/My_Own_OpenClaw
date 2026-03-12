"""Canonical unified computer-use function declaration schema."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict
from backend.src.tools.computer.grounding_contract import (
    build_drag_destination_json_properties,
    build_drag_destination_json_rules,
    build_source_grounding_json_properties,
    build_source_grounding_json_rules,
)

def _post_action_wait_property() -> Dict[str, Any]:
    return {
        "type": "number",
        "description": "Seconds to wait before post-action screenshot capture.",
        "default": 0,
        "minimum": 0,
        "maximum": 60,
    }


_COMPUTER_USE_FUNCTION_DECLARATION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "computer_use",
        "description": (
            "Unified computer-use tool for desktop interaction.\n\n"
            "Choose an action with `tool`, provide required rationale in `metadata` "
            "(`description`, `explanation`, `expectation`), and pass action-specific fields "
            "in `arguments`."
        ),
        "parameters": {
            "type": "object",
            "description": (
                "Envelope for unified computer-use calls."
            ),
            "additionalProperties": False,
            "required": ["tool", "metadata"],
            "properties": {
                "tool": {
                    "type": "string",
                    "description": "Computer-use action name.",
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
                    "description": "Required rationale metadata.",
                    "additionalProperties": False,
                    "required": ["description", "explanation", "expectation"],
                    "properties": {
                        "description": {
                            "type": "string",
                            "minLength": 1,
                            "description": "Observed UI state before the action.",
                        },
                        "explanation": {
                            "type": "string",
                            "minLength": 1,
                            "description": "Why this action is needed now.",
                        },
                        "expectation": {
                            "type": "string",
                            "minLength": 1,
                            "description": "Expected UI state after the action.",
                        },
                    },
                },
                "arguments": {
                    "type": "object",
                    "description": "Arguments for the selected `tool` action.",
                    "oneOf": [
                        {
                            "title": "mouse_control arguments",
                            "type": "object",
                            "required": ["action"],
                            "properties": {
                                "action": {
                                    "type": "string",
                                    "description": "Mouse action.",
                                    "enum": [
                                        "click",
                                        "double_click",
                                        "right_click",
                                        "move",
                                        "drag",
                                    ],
                                },
                                **build_source_grounding_json_properties(),
                                "button": {
                                    "type": "string",
                                    "description": "Mouse button for click actions.",
                                    "default": "left",
                                    "enum": ["left", "right", "middle"],
                                },
                                **build_drag_destination_json_properties(),
                                "duration": {
                                    "type": "number",
                                    "description": "Duration in seconds for drag operations.",
                                    "default": 0.5,
                                    "minimum": 0,
                                },
                                "wait": {
                                    **_post_action_wait_property(),
                                },
                            },
                            "allOf": [
                                *build_source_grounding_json_rules(),
                                *build_drag_destination_json_rules(),
                            ],
                        },
                        {
                            "title": "keyboard_control arguments",
                            "type": "object",
                            "required": ["action"],
                            "properties": {
                                "action": {
                                    "type": "string",
                                    "description": "Keyboard action.",
                                    "enum": ["type", "paste", "press", "hotkey"],
                                },
                                "text": {
                                    "type": "string",
                                    "description": "Text payload for type or paste.",
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
                                    "description": "Ordered key list for hotkey action.",
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
                                    **_post_action_wait_property(),
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
                                    "description": "Optional pre-capture delay in seconds.",
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
                                    ],
                                },
                                **build_source_grounding_json_properties(),
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
                                        "Optional explicit literal OS wheel click override. "
                                        "Fallback-only for follow-up fine tuning. Omit it on "
                                        "the first vertical scroll attempt for the default "
                                        "OS click count."
                                    ),
                                },
                                "wait": {
                                    **_post_action_wait_property(),
                                },
                            },
                            "allOf": [
                                *build_source_grounding_json_rules(),
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
                                    "description": "Window or tab title to focus.",
                                },
                                "match_mode": {
                                    "type": "string",
                                    "description": "Window title match mode.",
                                    "default": "exact",
                                    "enum": ["exact", "contains", "regex"],
                                },
                                "wait": {
                                    **_post_action_wait_property(),
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
