from backend.src.llm.parser_types import ToolCallSchema


def test_extract_tool_call_standard_format_trims_tool_name():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "  read_file  ", "args": {"path": "/tmp/a"}}}

    extracted = schema.extract_tool_call(payload)

    assert extracted == ("read_file", {"path": "/tmp/a"}, None)


def test_extract_tool_call_direct_metadata_returns_metadata():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": " mouse_control ",
            "args": {
                "action": "click",
                "x": 1,
                "y": 2,
                "metadata": {
                    "description": "screen",
                    "explanation": "click",
                    "expectation": "dialog",
                },
            },
        }
    }

    expected_metadata = dict(payload["functionCall"]["args"]["metadata"])
    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "mouse_control",
        {"action": "click", "x": 1, "y": 2},
        expected_metadata,
    )


def test_extract_tool_call_direct_metadata_does_not_mutate_input_payload():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "mouse_control",
            "args": {
                "action": "click",
                "x": 1,
                "y": 2,
                "metadata": {
                    "description": "screen",
                    "explanation": "click",
                    "expectation": "dialog",
                },
            },
        }
    }

    _ = schema.extract_tool_call(payload)

    assert payload["functionCall"]["args"]["metadata"] == {
        "description": "screen",
        "explanation": "click",
        "expectation": "dialog",
    }


def test_extract_tool_call_standard_format_returns_deep_copied_args():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "read_file",
            "args": {
                "path": "/tmp/a",
                "options": {"offset": 1, "limit": 10},
            },
        }
    }

    extracted = schema.extract_tool_call(payload)
    assert extracted is not None
    tool_name, args, metadata = extracted
    assert tool_name == "read_file"
    assert metadata is None

    args["options"]["offset"] = 99

    assert payload["functionCall"]["args"]["options"]["offset"] == 1


def test_extract_tool_call_rejects_non_dict_args():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "read_file", "args": "not-an-object"}}

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_defaults_missing_args_to_empty_dict():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "read_file"}}

    assert schema.extract_tool_call(payload) == ("read_file", {}, None)


def test_extract_tool_call_rejects_non_dict_standard_function_call():
    schema = ToolCallSchema()
    payload = {"functionCall": "not-a-dict"}

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_rejects_legacy_metadata_action_wrapper():
    schema = ToolCallSchema()
    payload = {
        "metadata": {"description": "d", "explanation": "e", "expectation": "x"},
        "action": {"functionCall": "not-a-dict"},
    }

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_unified_computer_use_maps_to_concrete_tool():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "mouse_control",
                "arguments": {"action": "click", "x": 10, "y": 20},
                "metadata": {
                    "description": "screen",
                    "explanation": "click submit",
                    "expectation": "dialog opens",
                },
            },
        }
    }

    expected_metadata = dict(payload["functionCall"]["args"]["metadata"])
    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "mouse_control",
        {"action": "click", "x": 10, "y": 20},
        expected_metadata,
    )


def test_extract_tool_call_unified_computer_use_does_not_mutate_input_payload():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "mouse_control",
                "arguments": {"action": "click", "x": 10, "y": 20},
                "metadata": {
                    "description": "screen",
                    "explanation": "click submit",
                    "expectation": "dialog opens",
                },
            },
        }
    }

    _ = schema.extract_tool_call(payload)

    assert payload["functionCall"]["args"]["metadata"] == {
        "description": "screen",
        "explanation": "click submit",
        "expectation": "dialog opens",
    }


def test_extract_tool_call_unified_computer_use_returns_deep_copied_arguments():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "mouse_control",
                "arguments": {
                    "action": "click",
                    "x": 10,
                    "y": 20,
                    "nested": {"candidate_id": "cand-1"},
                },
                "metadata": {
                    "description": "screen",
                    "explanation": "click submit",
                    "expectation": "dialog opens",
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)
    assert extracted is not None
    tool_name, args, metadata = extracted
    assert tool_name == "mouse_control"
    assert metadata == {
        "description": "screen",
        "explanation": "click submit",
        "expectation": "dialog opens",
    }

    args["nested"]["candidate_id"] = "cand-2"

    assert payload["functionCall"]["args"]["arguments"]["nested"]["candidate_id"] == "cand-1"


def test_extract_tool_call_unified_computer_use_defaults_missing_arguments_to_empty_dict():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "wait",
                "metadata": {
                    "description": "screen",
                    "explanation": "pause for load",
                    "expectation": "next state visible",
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "wait",
        {},
        {
            "description": "screen",
            "explanation": "pause for load",
            "expectation": "next state visible",
        },
    )


def test_extract_tool_call_unified_computer_use_rejects_non_dict_arguments():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "mouse_control",
                "arguments": "not-an-object",
                "metadata": {
                    "description": "screen",
                    "explanation": "click",
                    "expectation": "dialog opens",
                },
            },
        }
    }

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_unified_computer_use_rejects_unknown_subtool():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "totally_unknown",
                "arguments": {},
                "metadata": {
                    "description": "screen",
                    "explanation": "try action",
                    "expectation": "none",
                },
            },
        }
    }

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_unified_computer_use_trims_subtool_name():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "  mouse_control  ",
                "arguments": {"action": "click", "x": 9, "y": 8},
                "metadata": {
                    "description": "screen",
                    "explanation": "click",
                    "expectation": "dialog opens",
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "mouse_control",
        {"action": "click", "x": 9, "y": 8},
        {
            "description": "screen",
            "explanation": "click",
            "expectation": "dialog opens",
        },
    )


def test_extract_tool_call_unified_computer_use_rejects_blank_subtool_after_trim():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "   ",
                "arguments": {"action": "click", "x": 1, "y": 2},
                "metadata": {
                    "description": "screen",
                    "explanation": "click",
                    "expectation": "dialog opens",
                },
            },
        }
    }

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_unified_computer_use_defaults_null_arguments_to_empty_dict():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "wait",
                "arguments": None,
                "metadata": {
                    "description": "screen",
                    "explanation": "pause",
                    "expectation": "next state visible",
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "wait",
        {},
        {
            "description": "screen",
            "explanation": "pause",
            "expectation": "next state visible",
        },
    )


def test_extract_tool_call_unified_computer_use_keeps_nested_arguments_metadata_unpromoted():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "mouse_control",
                "arguments": {
                    "metadata": {
                        "description": "nested screen",
                        "explanation": "nested click",
                        "expectation": "nested dialog",
                    },
                    "action": "click",
                    "x": 30,
                    "y": 40,
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "mouse_control",
        {
            "metadata": {
                "description": "nested screen",
                "explanation": "nested click",
                "expectation": "nested dialog",
            },
            "action": "click",
            "x": 30,
            "y": 40,
        },
        None,
    )


def test_extract_tool_call_unified_computer_use_ignores_non_dict_top_level_metadata():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "computer_use",
            "args": {
                "tool": "mouse_control",
                "metadata": "not-an-object",
                "arguments": {"action": "click", "x": 3, "y": 4},
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == ("mouse_control", {"action": "click", "x": 3, "y": 4}, None)


def test_extract_tool_call_unified_system_use_maps_to_concrete_tool():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "system_use",
            "args": {
                "tool": "run_shell_command",
                "explanation": "verify shell",
                "arguments": {
                    "command": "echo hi",
                    "run_in_background": False,
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "run_shell_command",
        {
            "command": "echo hi",
            "run_in_background": False,
            "explanation": "verify shell",
        },
        None,
    )


def test_extract_tool_call_unified_system_use_maps_replace_to_replace():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "system_use",
            "args": {
                "tool": "replace",
                "explanation": "apply patch",
                "arguments": {
                    "file_path": "/tmp/a",
                    "old_string": "x",
                    "new_string": "y",
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "replace",
        {
            "file_path": "/tmp/a",
            "old_string": "x",
            "new_string": "y",
            "explanation": "apply patch",
        },
        None,
    )


def test_extract_tool_call_unified_system_use_uses_nested_explanation_fallback():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "system_use",
            "args": {
                "tool": "replace",
                "arguments": {
                    "file_path": "/tmp/a",
                    "old_string": "x",
                    "new_string": "y",
                    "explanation": "legacy nested rationale",
                },
            },
        }
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "replace",
        {
            "file_path": "/tmp/a",
            "old_string": "x",
            "new_string": "y",
            "explanation": "legacy nested rationale",
        },
        None,
    )


def test_extract_tool_call_unified_system_use_rejects_unknown_subtool():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "system_use",
            "args": {
                "tool": "unknown_system_action",
                "arguments": {},
            },
        }
    }

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_unified_system_use_rejects_non_dict_arguments():
    schema = ToolCallSchema()
    payload = {
        "functionCall": {
            "name": "system_use",
            "args": {
                "tool": "read_file",
                "arguments": "not-an-object",
            },
        }
    }

    assert schema.extract_tool_call(payload) is None
