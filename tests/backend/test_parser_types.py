"""Covers parser types behavior in the backend test suite."""

from backend.src.llm.parser_types import ToolCallSchema


def test_extract_tool_call_standard_format_trims_tool_name():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "  read_file  ", "args": {"path": "/tmp/a"}}}

    extracted = schema.extract_tool_call(payload)

    assert extracted == ("read_file", {"path": "/tmp/a"}, None)


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


def test_extract_tool_call_preserves_direct_metadata_inside_args():
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

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "mouse_control",
        {
            "action": "click",
            "x": 1,
            "y": 2,
            "metadata": {
                "description": "screen",
                "explanation": "click",
                "expectation": "dialog",
            },
        },
        None,
    )


def test_extract_tool_call_rejects_non_dict_args():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "read_file", "args": "not-an-object"}}

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_defaults_missing_args_to_empty_dict():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "read_file"}}

    assert schema.extract_tool_call(payload) == ("read_file", {}, None)


def test_extract_tool_call_rejects_non_dict_function_call():
    schema = ToolCallSchema()
    payload = {"functionCall": "not-a-dict"}

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_rejects_legacy_action_wrapper_shape():
    schema = ToolCallSchema()
    payload = {
        "metadata": {"description": "d", "explanation": "e", "expectation": "x"},
        "action": {"functionCall": "not-a-dict"},
    }

    assert schema.extract_tool_call(payload) is None
