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
            "Use this tool for local shell/process control, filesystem edits/reads, "
            "window listing, and system stats.\n\n"
            "Core contract:\n"
            "- Select a concrete action via `tool`.\n"
            "- Pass action arguments via `arguments`.\n"
            "\n"
            "Tools supported:\n"
            "- run_shell_command: execute shell commands in foreground/background modes.\n"
            "- replace: edit files via exact/context anchored replacements.\n"
            "- read_file: read files by offset/limit windows.\n"
            "- get_system_stats: read CPU/memory/battery usage.\n"
            "- get_open_windows: list open window titles for deterministic focus flows.\n"
        ),
        "parameters": {
            "type": "object",
            "description": (
                "Unified system/filesystem tool envelope. `tool` selects a concrete action. "
                "`arguments` must match that action schema."
            ),
            "additionalProperties": False,
            "required": ["tool"],
            "properties": {
                "tool": {
                    "type": "string",
                    "description": "Concrete system/filesystem action to execute.",
                    "enum": [
                        "run_shell_command",
                        "replace",
                        "read_file",
                        "get_system_stats",
                        "get_open_windows",
                    ],
                },
                "arguments": {
                    "type": "object",
                    "description": "Arguments for the selected `tool` action.",
                    "oneOf": [
                        {
                            "title": "run_shell_command arguments",
                            "type": "object",
                            "required": ["command", "run_in_background", "explanation"],
                            "properties": {
                                "command": {
                                    "type": "string",
                                    "description": "Exact command to execute",
                                },
                                "directory": {
                                    "type": "string",
                                    "description": (
                                        "(OPTIONAL) The absolute path of the directory to run the "
                                        "command in. If not provided, defaults to the OS user home "
                                        "directory. Must be an absolute path and must already exist."
                                    ),
                                },
                                "run_in_background": {
                                    "type": "boolean",
                                    "description": (
                                        "If True, start command asynchronously and return immediately "
                                        "with a session id. If False, wait for command completion and "
                                        "return output."
                                    ),
                                },
                                "terminate_after_seconds": {
                                    "type": "number",
                                    "description": (
                                        "(OPTIONAL, foreground only) Max seconds to wait before "
                                        "terminating command output collection."
                                    ),
                                    "default": 120,
                                },
                                "yield_after_seconds": {
                                    "type": "number",
                                    "description": (
                                        "(OPTIONAL) Return early if command exceeds this duration "
                                        "while keeping it running in the background."
                                    ),
                                },
                                "max_output_tokens": {
                                    "type": "integer",
                                    "exclusiveMinimum": 0,
                                    "description": (
                                        "(OPTIONAL) Maximum output tokens included for foreground "
                                        "results."
                                    ),
                                },
                                "env": {
                                    "type": "object",
                                    "description": "(OPTIONAL) Environment variable overrides.",
                                },
                                "pty": {
                                    "type": "boolean",
                                    "description": "(OPTIONAL) Request a pseudo-terminal.",
                                },
                                "explanation": {
                                    "type": "string",
                                    "description": (
                                        "One sentence explanation as to why this tool is being used, "
                                        "and how it contributes to the goal."
                                    ),
                                },
                                "wait": {
                                    "type": "number",
                                    "description": (
                                        "(OPTIONAL) Delay in seconds before taking a screenshot after "
                                        "execution."
                                    ),
                                },
                            },
                        },
                        {
                            "title": "replace arguments",
                            "type": "object",
                            "required": ["file_path", "explanation"],
                            "properties": {
                                "file_path": {
                                    "type": "string",
                                    "description": (
                                        "Absolute path to the file to edit. Creation is allowed only "
                                        "when one replacement operation has old_string=''."
                                    ),
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
                                    "description": "Optional batched replacements applied in order.",
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
                                    "description": "Optional apply_patch-style update chunks.",
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
                                "explanation": {
                                    "type": "string",
                                    "description": (
                                        "One sentence explanation as to why this tool is being used, "
                                        "and how it contributes to the goal."
                                    ),
                                },
                            },
                        },
                        {
                            "title": "read_file arguments",
                            "type": "object",
                            "required": ["file_path", "explanation"],
                            "properties": {
                                "file_path": {
                                    "type": "string",
                                    "description": "Absolute file path to read.",
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
                                "explanation": {
                                    "type": "string",
                                    "description": (
                                        "One sentence explanation as to why this tool is being used, "
                                        "and how it contributes to the goal."
                                    ),
                                },
                            },
                        },
                        {
                            "title": "get_system_stats arguments",
                            "type": "object",
                            "required": ["explanation"],
                            "properties": {
                                "explanation": {
                                    "type": "string",
                                    "description": (
                                        "One sentence explanation as to why this tool is being used, "
                                        "and how it contributes to the goal."
                                    ),
                                }
                            },
                        },
                        {
                            "title": "get_open_windows arguments",
                            "type": "object",
                            "required": ["explanation"],
                            "properties": {
                                "filter_text": {
                                    "type": "string",
                                    "description": (
                                        "Optional text to filter window titles by "
                                        "(case-insensitive)."
                                    ),
                                    "default": "",
                                },
                                "explanation": {
                                    "type": "string",
                                    "description": (
                                        "One sentence explanation as to why this tool is being used, "
                                        "and how it contributes to the goal."
                                    ),
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
