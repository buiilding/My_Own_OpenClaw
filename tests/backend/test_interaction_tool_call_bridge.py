"""Tests for execution tool-call bridge helpers."""

from backend.src.agent.execution.tool_call_bridge import (
    build_raw_tool_call_preview,
    build_recoverable_tool_output_message,
    extract_raw_arguments_preview_from_error,
    extract_raw_tool_call_preview_from_error,
    extract_tool_call_parse_error_from_error,
    extract_tool_call_id_from_error,
    extract_tool_call_ids,
    extract_tool_name_from_error,
    is_recoverable_llm_tool_call_error,
    to_history_tool_calls,
    to_parsed_response,
)
from backend.src.llm.parser_types import ParsedToolCall


def test_to_parsed_response_normalizes_native_tool_calls():
    parsed = to_parsed_response(
        {
            "content": "assistant text",
            "tool_calls": [
                {
                    "id": "call_123",
                    "name": "replace",
                    "arguments": {"path": "README.md", "metadata": {"source": "llm"}},
                }
            ],
        }
    )

    assert parsed.text_content == "assistant text"
    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    assert parsed.tool_calls[0].tool_name == "system_use"
    assert parsed.tool_calls[0].parameters == {
        "tool": "replace",
        "arguments": {"path": "README.md"},
    }
    assert parsed.tool_calls[0].metadata == {
        "tool_call_id": "call_123",
        "source": "llm",
        "model_facing_tool_call": {
            "id": "call_123",
            "name": "replace",
            "arguments": {
                "path": "README.md",
                "metadata": {"source": "llm"},
            },
        },
    }


def test_to_parsed_response_handles_invalid_native_payload_fields():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [{"id": "", "name": " ", "arguments": "not-a-dict"}],
        }
    )

    assert parsed.has_tool_calls is True
    assert parsed.tool_calls[0].tool_name == "unknown_tool"
    assert parsed.tool_calls[0].parameters == {}
    assert parsed.tool_calls[0].metadata is None


def test_to_parsed_response_returns_deep_copied_arguments():
    payload = {
        "content": "",
        "tool_calls": [
            {
                "id": "call_read_1",
                "name": "read_file",
                "arguments": {
                    "file_path": "/tmp/a",
                    "options": {"offset": 1, "limit": 5},
                },
            }
        ],
    }

    parsed = to_parsed_response(payload)
    parsed.tool_calls[0].parameters["arguments"]["options"]["offset"] = 99

    assert payload["tool_calls"][0]["arguments"]["options"]["offset"] == 1


def test_to_history_tool_calls_returns_deep_copied_arguments():
    parsed_tool_call = ParsedToolCall(
        tool_name="read_file",
        parameters={"file_path": "/tmp/a", "options": {"offset": 1, "limit": 5}},
        metadata={"tool_call_id": "call_read_1"},
    )

    history_calls = to_history_tool_calls([parsed_tool_call])
    history_calls[0]["arguments"]["options"]["offset"] = 77

    assert parsed_tool_call.parameters["options"]["offset"] == 1


def test_to_history_tool_calls_preserves_ids_with_fallback():
    history_calls = to_history_tool_calls(
        [
            ParsedToolCall(
                tool_name="first",
                parameters={"x": 1},
                metadata={"tool_call_id": "id_1"},
            ),
            ParsedToolCall(
                tool_name="second",
                parameters={"y": 2},
                metadata=None,
            ),
        ]
    )

    assert history_calls == [
        {"id": "id_1", "name": "first", "arguments": {"x": 1}},
        {"id": "tool_call_1", "name": "second", "arguments": {"y": 2}},
    ]


def test_tool_call_bridge_preserves_thought_signature_between_shapes():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "name": "browser",
                    "arguments": {"action": "snapshot"},
                    "thought_signature": "sig-123",
                }
            ],
        }
    )

    assert parsed.tool_calls[0].metadata is not None
    assert parsed.tool_calls[0].metadata["thought_signature"] == "sig-123"

    history_calls = to_history_tool_calls(parsed.tool_calls)
    assert history_calls == [
        {
            "id": "call_1",
            "name": "browser",
            "arguments": {"action": "snapshot"},
            "thought_signature": "sig-123",
        }
    ]


def test_extract_tool_call_ids_ignores_missing_or_invalid_values():
    ids = extract_tool_call_ids(
        [
            ParsedToolCall(tool_name="a", parameters={}, metadata={"tool_call_id": "ok_1"}),
            ParsedToolCall(tool_name="b", parameters={}, metadata={"tool_call_id": ""}),
            ParsedToolCall(tool_name="c", parameters={}, metadata={"tool_call_id": 123}),
            ParsedToolCall(tool_name="d", parameters={}, metadata=None),
            ParsedToolCall(tool_name="e", parameters={}, metadata={"tool_call_id": "ok_2"}),
        ]
    )

    assert ids == ["ok_1", "ok_2"]


def test_extract_tool_call_ids_ignores_whitespace_only_ids():
    ids = extract_tool_call_ids(
        [
            ParsedToolCall(tool_name="a", parameters={}, metadata={"tool_call_id": "  "}),
            ParsedToolCall(tool_name="b", parameters={}, metadata={"tool_call_id": "\n"}),
            ParsedToolCall(tool_name="c", parameters={}, metadata={"tool_call_id": "ok_3"}),
        ]
    )

    assert ids == ["ok_3"]


def test_to_history_tool_calls_falls_back_when_tool_call_id_is_whitespace():
    history_calls = to_history_tool_calls(
        [
            ParsedToolCall(
                tool_name="read_file",
                parameters={"file_path": "/tmp/a"},
                metadata={"tool_call_id": "   "},
            ),
        ]
    )

    assert history_calls == [
        {"id": "tool_call_0", "name": "read_file", "arguments": {"file_path": "/tmp/a"}},
    ]


def test_to_parsed_response_maps_unified_computer_use_to_concrete_tool():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_mouse_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "mouse_control",
                        "metadata": {
                            "description": "screen",
                            "explanation": "click target",
                            "expectation": "dialog opens",
                        },
                        "arguments": {
                            "action": "click",
                            "x": 120,
                            "y": 240,
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "mouse_control"
    assert call.parameters == {"action": "click", "x": 120, "y": 240}
    assert call.metadata == {
        "tool_call_id": "call_mouse_1",
        "description": "screen",
        "explanation": "click target",
        "expectation": "dialog opens",
        "model_facing_tool_call": {
            "id": "call_mouse_1",
            "name": "computer_use",
            "arguments": {
                "tool": "mouse_control",
                "metadata": {
                    "description": "screen",
                    "explanation": "click target",
                    "expectation": "dialog opens",
                },
                "arguments": {
                    "action": "click",
                    "x": 120,
                    "y": 240,
                },
            },
        },
    }


def test_to_parsed_response_marks_invalid_computer_use_tool_name():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_bad_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "unknown_computer_action",
                        "metadata": {
                            "description": "screen",
                            "explanation": "try",
                            "expectation": "none",
                        },
                        "arguments": {"action": "click"},
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    call = parsed.tool_calls[0]
    assert call.tool_name == "invalid_computer_use_tool"
    assert call.parameters == {"action": "click"}
    assert call.metadata == {
        "tool_call_id": "call_bad_1",
        "description": "screen",
        "explanation": "try",
        "expectation": "none",
        "model_facing_tool_call": {
            "id": "call_bad_1",
            "name": "computer_use",
            "arguments": {
                "tool": "unknown_computer_action",
                "metadata": {
                    "description": "screen",
                    "explanation": "try",
                    "expectation": "none",
                },
                "arguments": {"action": "click"},
            },
        },
    }


def test_to_parsed_response_maps_unified_computer_use_without_arguments_to_empty_parameters():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_wait_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "wait",
                        "metadata": {
                            "description": "screen",
                            "explanation": "wait for response",
                            "expectation": "new content appears",
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "wait"
    assert call.parameters == {}
    assert call.metadata == {
        "tool_call_id": "call_wait_1",
        "description": "screen",
        "explanation": "wait for response",
        "expectation": "new content appears",
        "model_facing_tool_call": {
            "id": "call_wait_1",
            "name": "computer_use",
            "arguments": {
                "tool": "wait",
                "metadata": {
                    "description": "screen",
                    "explanation": "wait for response",
                    "expectation": "new content appears",
                },
            },
        },
    }


def test_to_parsed_response_unified_computer_use_does_not_promote_nested_arguments_metadata():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_mouse_nested_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "mouse_control",
                        "arguments": {
                            "metadata": {
                                "description": "nested screen",
                                "explanation": "nested click",
                                "expectation": "nested dialog",
                            },
                            "action": "click",
                            "x": 320,
                            "y": 180,
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "invalid_computer_use_tool"
    assert call.parameters == {
        "metadata": {
            "description": "nested screen",
            "explanation": "nested click",
            "expectation": "nested dialog",
        },
        "action": "click",
        "x": 320,
        "y": 180,
    }
    assert call.metadata == {
        "tool_call_id": "call_mouse_nested_1",
        "model_facing_tool_call": {
            "id": "call_mouse_nested_1",
            "name": "computer_use",
            "arguments": {
                "tool": "mouse_control",
                "arguments": {
                    "metadata": {
                        "description": "nested screen",
                        "explanation": "nested click",
                        "expectation": "nested dialog",
                    },
                    "action": "click",
                    "x": 320,
                    "y": 180,
                },
            },
        },
    }


def test_to_parsed_response_unified_computer_use_rejects_non_dict_top_level_metadata():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_mouse_badmeta_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "mouse_control",
                        "metadata": "not-an-object",
                        "arguments": {
                            "action": "click",
                            "x": 100,
                            "y": 200,
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "invalid_computer_use_tool"
    assert call.parameters == {"action": "click", "x": 100, "y": 200}
    assert call.metadata == {
        "tool_call_id": "call_mouse_badmeta_1",
        "model_facing_tool_call": {
            "id": "call_mouse_badmeta_1",
            "name": "computer_use",
            "arguments": {
                "tool": "mouse_control",
                "metadata": "not-an-object",
                "arguments": {
                    "action": "click",
                    "x": 100,
                    "y": 200,
                },
            },
        },
    }


def test_to_parsed_response_unified_computer_use_rejects_missing_required_metadata():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_mouse_missing_meta_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "mouse_control",
                        "arguments": {
                            "action": "click",
                            "x": 10,
                            "y": 20,
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "invalid_computer_use_tool"
    assert call.parameters == {"action": "click", "x": 10, "y": 20}
    assert call.metadata == {
        "tool_call_id": "call_mouse_missing_meta_1",
        "model_facing_tool_call": {
            "id": "call_mouse_missing_meta_1",
            "name": "computer_use",
            "arguments": {
                "tool": "mouse_control",
                "arguments": {
                    "action": "click",
                    "x": 10,
                    "y": 20,
                },
            },
        },
    }


def test_to_parsed_response_unified_computer_use_rejects_blank_required_metadata_values():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_mouse_blank_meta_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "mouse_control",
                        "metadata": {
                            "description": "screen",
                            "explanation": "   ",
                            "expectation": "dialog opens",
                        },
                        "arguments": {
                            "action": "click",
                            "x": 10,
                            "y": 20,
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "invalid_computer_use_tool"
    assert call.parameters == {"action": "click", "x": 10, "y": 20}
    assert call.metadata == {
        "tool_call_id": "call_mouse_blank_meta_1",
        "description": "screen",
        "expectation": "dialog opens",
        "model_facing_tool_call": {
            "id": "call_mouse_blank_meta_1",
            "name": "computer_use",
            "arguments": {
                "tool": "mouse_control",
                "metadata": {
                    "description": "screen",
                    "explanation": "   ",
                    "expectation": "dialog opens",
                },
                "arguments": {
                    "action": "click",
                    "x": 10,
                    "y": 20,
                },
            },
        },
    }


def test_to_parsed_response_unified_computer_use_rejects_unexpected_metadata_fields():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_mouse_trimmed_meta_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "mouse_control",
                        "metadata": {
                            "description": "  screen  ",
                            "explanation": "  click target ",
                            "expectation": " dialog opens  ",
                            "trace_id": "abc-123",
                        },
                        "arguments": {
                            "action": "click",
                            "x": 10,
                            "y": 20,
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "invalid_computer_use_tool"
    assert call.parameters == {"action": "click", "x": 10, "y": 20}
    assert call.metadata == {
        "tool_call_id": "call_mouse_trimmed_meta_1",
        "description": "screen",
        "explanation": "click target",
        "expectation": "dialog opens",
        "model_facing_tool_call": {
            "id": "call_mouse_trimmed_meta_1",
            "name": "computer_use",
            "arguments": {
                "tool": "mouse_control",
                "metadata": {
                    "description": "  screen  ",
                    "explanation": "  click target ",
                    "expectation": " dialog opens  ",
                    "trace_id": "abc-123",
                },
                "arguments": {
                    "action": "click",
                    "x": 10,
                    "y": 20,
                },
            },
        },
    }


def test_to_parsed_response_direct_computer_subtool_requires_metadata():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_direct_mouse_1",
                    "name": "mouse_control",
                    "arguments": {
                        "action": "click",
                        "x": 11,
                        "y": 22,
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "invalid_computer_use_tool"
    assert call.parameters == {"action": "click", "x": 11, "y": 22}
    assert call.metadata == {
        "tool_call_id": "call_direct_mouse_1",
        "model_facing_tool_call": {
            "id": "call_direct_mouse_1",
            "name": "mouse_control",
            "arguments": {
                "action": "click",
                "x": 11,
                "y": 22,
            },
        },
    }


def test_to_history_tool_calls_preserves_invalid_computer_use_raw_wrapper():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_bad_history_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "mouse_control",
                        "arguments": {
                            "action": "click",
                            "x": 15,
                            "y": 25,
                        },
                    },
                }
            ],
        }
    )

    history_calls = to_history_tool_calls(parsed.tool_calls)

    assert history_calls == [
        {
            "id": "call_bad_history_1",
            "name": "computer_use",
            "arguments": {
                "tool": "mouse_control",
                "arguments": {
                    "action": "click",
                    "x": 15,
                    "y": 25,
                },
            },
        }
    ]


def test_to_parsed_response_maps_unified_system_use_to_concrete_tool():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_shell_1",
                    "name": "system_use",
                    "arguments": {
                        "tool": "run_shell_command",
                        "explanation": "verify shell path",
                        "arguments": {
                            "command": "echo hi",
                            "run_in_background": False,
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "run_shell_command"
    assert call.parameters == {
        "command": "echo hi",
        "run_in_background": False,
        "explanation": "verify shell path",
    }
    assert call.metadata == {
        "tool_call_id": "call_shell_1",
        "model_facing_tool_call": {
            "id": "call_shell_1",
            "name": "system_use",
            "arguments": {
                "tool": "run_shell_command",
                "explanation": "verify shell path",
                "arguments": {
                    "command": "echo hi",
                    "run_in_background": False,
                },
            },
        },
    }


def test_to_parsed_response_maps_unified_system_use_without_arguments_to_empty_parameters():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_windows_empty_1",
                    "name": "system_use",
                    "arguments": {
                        "tool": "get_open_windows",
                        "explanation": "inspect currently open windows",
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "get_open_windows"
    assert call.parameters == {"explanation": "inspect currently open windows"}
    assert call.metadata == {
        "tool_call_id": "call_windows_empty_1",
        "model_facing_tool_call": {
            "id": "call_windows_empty_1",
            "name": "system_use",
            "arguments": {
                "tool": "get_open_windows",
                "explanation": "inspect currently open windows",
            },
        },
    }


def test_to_history_tool_calls_preserves_successful_unified_computer_use_wrapper():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_screenshot_1",
                    "name": "computer_use",
                    "arguments": {
                        "tool": "screenshot",
                        "metadata": {
                            "description": "System Settings is open",
                            "explanation": "Verify the currently focused window",
                            "expectation": "A screenshot of the current desktop is captured",
                        },
                        "arguments": {},
                    },
                }
            ],
        }
    )

    history_calls = to_history_tool_calls(parsed.tool_calls)

    assert history_calls == [
        {
            "id": "call_screenshot_1",
            "name": "computer_use",
            "arguments": {
                "tool": "screenshot",
                "metadata": {
                    "description": "System Settings is open",
                    "explanation": "Verify the currently focused window",
                    "expectation": "A screenshot of the current desktop is captured",
                },
                "arguments": {},
            },
        }
    ]


def test_to_parsed_response_maps_unified_system_use_replace_to_replace():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_replace_1",
                    "name": "system_use",
                    "arguments": {
                        "tool": "replace",
                        "explanation": "patch file",
                        "arguments": {
                            "file_path": "/tmp/a.txt",
                            "old_string": "x",
                            "new_string": "y",
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "replace"
    assert call.parameters == {
        "file_path": "/tmp/a.txt",
        "old_string": "x",
        "new_string": "y",
        "explanation": "patch file",
    }
    assert call.metadata == {
        "tool_call_id": "call_replace_1",
        "model_facing_tool_call": {
            "id": "call_replace_1",
            "name": "system_use",
            "arguments": {
                "tool": "replace",
                "explanation": "patch file",
                "arguments": {
                    "file_path": "/tmp/a.txt",
                    "old_string": "x",
                    "new_string": "y",
                },
            },
        },
    }


def test_to_parsed_response_strips_nested_system_use_explanation_without_top_level():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_replace_fallback_1",
                    "name": "system_use",
                    "arguments": {
                        "tool": "replace",
                        "arguments": {
                            "file_path": "/tmp/a.txt",
                            "old_string": "x",
                            "new_string": "y",
                            "explanation": "legacy nested patch rationale",
                        },
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "replace"
    assert call.parameters == {
        "file_path": "/tmp/a.txt",
        "old_string": "x",
        "new_string": "y",
    }
    assert call.metadata == {
        "tool_call_id": "call_replace_fallback_1",
        "model_facing_tool_call": {
            "id": "call_replace_fallback_1",
            "name": "system_use",
            "arguments": {
                "tool": "replace",
                "arguments": {
                    "file_path": "/tmp/a.txt",
                    "old_string": "x",
                    "new_string": "y",
                    "explanation": "legacy nested patch rationale",
                },
            },
        },
    }


def test_to_parsed_response_keeps_unified_system_use_when_subtool_is_invalid():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_system_bad_1",
                    "name": "system_use",
                    "arguments": {
                        "tool": "not_a_real_system_tool",
                        "arguments": {"command": "echo hi"},
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "system_use"
    assert call.parameters == {
        "tool": "not_a_real_system_tool",
        "arguments": {"command": "echo hi"},
    }
    assert call.metadata == {
        "tool_call_id": "call_system_bad_1",
        "model_facing_tool_call": {
            "id": "call_system_bad_1",
            "name": "system_use",
            "arguments": {
                "tool": "not_a_real_system_tool",
                "arguments": {"command": "echo hi"},
            },
        },
    }


def test_to_parsed_response_canonicalizes_direct_legacy_system_tool_to_system_use():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_windows_1",
                    "name": "get_open_windows",
                    "arguments": {
                        "filter_text": "System Settings",
                        "explanation": "inspect settings windows",
                    },
                }
            ],
        }
    )

    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    call = parsed.tool_calls[0]
    assert call.tool_name == "system_use"
    assert call.parameters == {
        "tool": "get_open_windows",
        "explanation": "inspect settings windows",
        "arguments": {
            "filter_text": "System Settings",
        },
    }
    assert call.metadata == {
        "tool_call_id": "call_windows_1",
        "model_facing_tool_call": {
            "id": "call_windows_1",
            "name": "get_open_windows",
            "arguments": {
                "filter_text": "System Settings",
                "explanation": "inspect settings windows",
            },
        },
    }


def test_recoverable_error_detection_and_message_formatting():
    error_msg = (
        "Invalid response from stream: failed to parse streamed tool-call arguments "
        "for id=call_bad name=replace"
    )

    assert is_recoverable_llm_tool_call_error(error_msg) is True
    assert extract_tool_call_id_from_error(error_msg) == "call_bad"
    assert extract_tool_name_from_error(error_msg) == "replace"

    formatted = build_recoverable_tool_output_message(
        "replace",
        error_msg,
        raw_arguments_preview='{"file_path":"/tmp/demo.txt","new_string":"..."}',
    )
    assert formatted.startswith("replace output:")
    assert "malformed tool-call arguments from model" in formatted
    assert "retry_guidance: retry the same tool with smaller argument payload chunks." in formatted
    assert "target_file: /tmp/demo.txt" in formatted
    assert "status: failed" in formatted


def test_extract_raw_arguments_preview_and_parse_error_summary():
    error_msg = (
        "Unexpected system error: [LLM_API_ERROR] Invalid response from stream: "
        "failed to parse streamed tool-call arguments for id=tool_bad name=run_shell_command. "
        "Raw tool call preview: '{\"id\":\"tool_bad\",\"name\":\"run_shell_command\",\"arguments\":\"{\\\"command\\\":\\\"cat > index.html << \\\\\\\"EOF\\\\\\\"\\\"}...[truncated]\"}' "
        "Raw arguments preview: '{\"command\":\"cat > index.html << \\\"EOF\\\"\\\\n<!DOCTYPE html>...\"...[truncated]'"
    )

    raw_tool_call_preview = extract_raw_tool_call_preview_from_error(error_msg)
    preview = extract_raw_arguments_preview_from_error(error_msg)
    summary = extract_tool_call_parse_error_from_error(error_msg)

    assert raw_tool_call_preview.startswith('{"id":"tool_bad"')
    assert '"name":"run_shell_command"' in raw_tool_call_preview
    assert preview.startswith("{\"command\"")
    assert preview.endswith("...[truncated]")
    assert "failed to parse streamed tool-call arguments" in summary
    assert "Raw tool call preview" not in summary
    assert "Raw arguments preview" not in summary


def test_build_raw_tool_call_preview_serializes_raw_arguments_string():
    preview = build_raw_tool_call_preview(
        tool_call_id="tool_bad",
        tool_name="system_use",
        raw_arguments_preview='{"tool":"run_shell_command","arguments":{"command":"pwd"}}',
    )

    assert preview == (
        '{"id":"tool_bad","name":"system_use",'
        '"arguments":"{\\"tool\\":\\"run_shell_command\\",\\"arguments\\":{\\"command\\":\\"pwd\\"}}"}'
    )
