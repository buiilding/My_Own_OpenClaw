"""Canonical unified system/filesystem function declaration schema."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict


_SYSTEM_USE_FUNCTION_DECLARATION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "system_use",
        "description": (
            "Unified system/filesystem tool.\n\n"
            "Choose an action with `tool`, provide top-level rationale in `explanation`, "
            "and pass action-specific fields in `arguments`."
        ),
        "parameters": {
            "type": "object",
            "description": (
                "Envelope for unified system/filesystem calls."
            ),
            "additionalProperties": False,
            "required": ["tool", "explanation"],
            "properties": {
                "tool": {
                    "type": "string",
                    "description": "System/filesystem action name.",
                    "enum": [
                        "run_shell_command",
                        "replace",
                        "read_file",
                        "get_system_stats",
                        "get_open_windows",
                    ],
                },
                "explanation": {
                    "type": "string",
                    "description": "Why this action is needed.",
                    "minLength": 1,
                },
                "arguments": {
                    "type": "object",
                    "description": "Arguments for the selected `tool` action.",
                    "oneOf": [
                        {
                            "title": "run_shell_command arguments",
                            "type": "object",
                            "required": ["command", "run_in_background"],
                            "properties": {
                                "command": {
                                    "type": "string",
                                    "description": "Shell command to execute.",
                                },
                                "directory": {
                                    "type": "string",
                                    "description": "Optional absolute working directory.",
                                },
                                "run_in_background": {
                                    "type": "boolean",
                                    "description": "Run command asynchronously when true.",
                                },
                                "terminate_after_seconds": {
                                    "type": "number",
                                    "description": "Optional foreground timeout in seconds.",
                                    "default": 120,
                                },
                                "yield_after_seconds": {
                                    "type": "number",
                                    "description": "Optional early-return threshold in seconds.",
                                },
                                "max_output_tokens": {
                                    "type": "integer",
                                    "exclusiveMinimum": 0,
                                    "description": "Optional max output tokens for foreground mode.",
                                },
                                "env": {
                                    "type": "object",
                                    "description": "Optional environment overrides.",
                                },
                                "pty": {
                                    "type": "boolean",
                                    "description": "Optional pseudo-terminal request.",
                                },
                                "wait": {
                                    "type": "number",
                                    "description": "Optional delay before post-command screenshot.",
                                },
                            },
                        },
                        {
                            "title": "replace arguments",
                            "type": "object",
                            "required": ["file_path"],
                            "properties": {
                                "file_path": {
                                    "type": "string",
                                    "description": "Absolute path to the file.",
                                },
                                "old_string": {
                                    "type": "string",
                                    "description": "Single-operation old string.",
                                },
                                "new_string": {
                                    "type": "string",
                                    "description": "Single-operation replacement string.",
                                },
                                "replace_all": {
                                    "type": "boolean",
                                    "description": "Replace all matches for old_string.",
                                    "default": False,
                                },
                                "before_context": {
                                    "type": "string",
                                    "description": "Optional required context before old_string.",
                                },
                                "after_context": {
                                    "type": "string",
                                    "description": "Optional required context after old_string.",
                                },
                                "occurrence_index": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "description": "Optional 1-based match index.",
                                },
                                "require_eof": {
                                    "type": "boolean",
                                    "description": "Require match at EOF.",
                                    "default": False,
                                },
                                "match_mode": {
                                    "type": "string",
                                    "enum": ["strict", "lenient"],
                                    "description": "Matching mode for single and batched operations.",
                                    "default": "lenient",
                                },
                                "replacements": {
                                    "type": "array",
                                    "description": "Optional batch replacements.",
                                    "items": {
                                        "type": "object",
                                        "required": ["old_string", "new_string"],
                                        "properties": {
                                            "old_string": {"type": "string"},
                                            "new_string": {"type": "string"},
                                            "replace_all": {
                                                "type": "boolean",
                                                "default": False,
                                            },
                                            "before_context": {"type": "string"},
                                            "after_context": {"type": "string"},
                                            "occurrence_index": {
                                                "type": "integer",
                                                "minimum": 1,
                                            },
                                            "require_eof": {
                                                "type": "boolean",
                                                "default": False,
                                            },
                                            "match_mode": {
                                                "type": "string",
                                                "enum": ["strict", "lenient"],
                                            },
                                        },
                                    },
                                },
                                "patch_chunks": {
                                    "type": "array",
                                    "description": "Optional patch-style update chunks.",
                                    "items": {
                                        "type": "object",
                                        "required": ["old_lines", "new_lines"],
                                        "properties": {
                                            "change_context": {"type": "string"},
                                            "old_lines": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                            },
                                            "new_lines": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                            },
                                            "is_end_of_file": {
                                                "type": "boolean",
                                                "default": False,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        {
                            "title": "read_file arguments",
                            "type": "object",
                            "required": ["file_path"],
                            "properties": {
                                "file_path": {
                                    "type": "string",
                                    "description": "Absolute file path.",
                                },
                                "offset": {
                                    "type": "integer",
                                    "minimum": 0,
                                    "description": "0-based line offset to start reading from.",
                                },
                                "limit": {
                                    "type": "integer",
                                    "exclusiveMinimum": 0,
                                    "description": "Maximum number of lines to read.",
                                },
                            },
                        },
                        {
                            "title": "get_system_stats arguments",
                            "type": "object",
                            "properties": {},
                        },
                        {
                            "title": "get_open_windows arguments",
                            "type": "object",
                            "properties": {
                                "filter_text": {
                                    "type": "string",
                                    "description": (
                                        "Optional text to filter window titles by "
                                        "(case-insensitive)."
                                    ),
                                    "default": "",
                                },
                            },
                        },
                    ],
                },
            },
        },
    },
}


def get_unified_system_use_function_declaration() -> Dict[str, Any]:
    """Return the canonical unified system/filesystem function declaration schema."""
    return deepcopy(_SYSTEM_USE_FUNCTION_DECLARATION)
