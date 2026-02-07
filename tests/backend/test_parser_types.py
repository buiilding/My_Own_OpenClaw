from backend.src.llm.parser_types import ToolCallSchema


def test_extract_tool_call_standard_format_trims_tool_name():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "  read_file  ", "args": {"path": "/tmp/a"}}}

    extracted = schema.extract_tool_call(payload)

    assert extracted == ("read_file", {"path": "/tmp/a"}, None)


def test_extract_tool_call_metadata_wrapper_returns_metadata():
    schema = ToolCallSchema()
    payload = {
        "metadata": {
            "description": "screen",
            "explanation": "click",
            "expectation": "dialog",
        },
        "action": {
            "functionCall": {
                "name": " mouse_control ",
                "args": {"action": "click", "x": 1, "y": 2},
            }
        },
    }

    extracted = schema.extract_tool_call(payload)

    assert extracted == (
        "mouse_control",
        {"action": "click", "x": 1, "y": 2},
        payload["metadata"],
    )


def test_extract_tool_call_rejects_non_dict_args():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "read_file", "args": "not-an-object"}}

    assert schema.extract_tool_call(payload) is None


def test_extract_tool_call_defaults_missing_args_to_empty_dict():
    schema = ToolCallSchema()
    payload = {"functionCall": {"name": "read_file"}}

    assert schema.extract_tool_call(payload) == ("read_file", {}, None)
