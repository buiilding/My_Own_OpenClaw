"""Canonical unified computer-use function declaration schema."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict


def _require_manual_xy_for_coordinates() -> Dict[str, Any]:
    return {
        "if": {
            "properties": {
                "find_coordinates_by": {"const": "manual"}
            },
            "required": ["find_coordinates_by"],
        },
        "then": {"required": ["x", "y"]},
    }


def _require_ocr_text_or_candidate_id() -> Dict[str, Any]:
    return {
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
    }


def _require_prediction_description() -> Dict[str, Any]:
    return {
        "if": {
            "properties": {
                "find_coordinates_by": {"const": "prediction"}
            },
            "required": ["find_coordinates_by"],
        },
        "then": {"required": ["description"]},
    }


def _require_drag_destination_manual_xy() -> Dict[str, Any]:
    return {
        "if": {
            "properties": {
                "action": {"const": "drag"},
                "drag_to_find_coordinates_by": {"const": "manual"},
            },
            "required": ["action", "drag_to_find_coordinates_by"],
        },
        "then": {"required": ["drag_to_x", "drag_to_y"]},
    }


def _require_drag_destination_ocr_target() -> Dict[str, Any]:
    return {
        "if": {
            "properties": {
                "action": {"const": "drag"},
                "drag_to_find_coordinates_by": {"const": "ocr"},
            },
            "required": ["action", "drag_to_find_coordinates_by"],
        },
        "then": {
            "anyOf": [
                {"required": ["drag_to_ocr_text"]},
                {"required": ["drag_to_candidate_id"]},
            ]
        },
    }


def _require_drag_destination_prediction_description() -> Dict[str, Any]:
    return {
        "if": {
            "properties": {
                "action": {"const": "drag"},
                "drag_to_find_coordinates_by": {"const": "prediction"},
            },
            "required": ["action", "drag_to_find_coordinates_by"],
        },
        "then": {"required": ["drag_to_description"]},
    }


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
                                        "scroll",
                                    ],
                                },
                                "find_coordinates_by": {
                                    "type": "string",
                                    "description": "Coordinate targeting method.",
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
                                    "description": "Visible text target for OCR selection.",
                                },
                                "candidate_id": {
                                    "type": "string",
                                    "description": "OCR candidate id from an earlier response.",
                                },
                                "description": {
                                    "type": "string",
                                    "description": "Visual target description for prediction.",
                                },
                                "model_name": {
                                    "type": "string",
                                    "description": "Optional prediction model override.",
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
                                        "Destination X for drag. Required when action='drag' and "
                                        "drag_to_find_coordinates_by='manual'."
                                    ),
                                },
                                "drag_to_y": {
                                    "type": "integer",
                                    "description": (
                                        "Destination Y for drag. Required when action='drag' and "
                                        "drag_to_find_coordinates_by='manual'."
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
                                    "description": "Visible text target for OCR drag destination.",
                                },
                                "drag_to_candidate_id": {
                                    "type": "string",
                                    "description": "OCR candidate id for drag destination.",
                                },
                                "drag_to_description": {
                                    "type": "string",
                                    "description": "Visual drag destination for prediction.",
                                },
                                "drag_to_model_name": {
                                    "type": "string",
                                    "description": "Optional model override for drag prediction.",
                                },
                                "duration": {
                                    "type": "number",
                                    "description": "Duration in seconds for drag operations.",
                                    "default": 0.5,
                                    "minimum": 0,
                                },
                                "scroll_amount": {
                                    "type": "integer",
                                    "description": "Signed scroll amount.",
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
                                    "description": "Scroll step count.",
                                    "default": 5,
                                },
                                "wait": {
                                    **_post_action_wait_property(),
                                },
                            },
                            "allOf": [
                                _require_manual_xy_for_coordinates(),
                                _require_ocr_text_or_candidate_id(),
                                _require_prediction_description(),
                                _require_drag_destination_manual_xy(),
                                _require_drag_destination_ocr_target(),
                                _require_drag_destination_prediction_description(),
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
                                        "scroll_left",
                                        "scroll_right",
                                    ],
                                },
                                "find_coordinates_by": {
                                    "type": "string",
                                    "description": "Scroll focus targeting method.",
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
                                    "description": "Visible text target for OCR selection.",
                                },
                                "candidate_id": {
                                    "type": "string",
                                    "description": "OCR candidate id from an earlier response.",
                                },
                                "description": {
                                    "type": "string",
                                    "description": "Visual target description for prediction.",
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
                                    "description": "Scroll step count.",
                                    "default": 5,
                                },
                                "amount": {
                                    "type": "integer",
                                    "description": "Scroll amount.",
                                    "minimum": 100,
                                    "maximum": 5000,
                                },
                                "wait": {
                                    **_post_action_wait_property(),
                                },
                            },
                            "allOf": [
                                _require_manual_xy_for_coordinates(),
                                _require_ocr_text_or_candidate_id(),
                                _require_prediction_description(),
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
