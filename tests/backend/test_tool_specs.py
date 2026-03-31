from backend.src.tools.tool_specs import (
    build_function_tool_spec,
    is_function_tool_spec,
    to_litellm_function_tool,
    to_litellm_tool_choice,
)


def test_build_function_tool_spec_creates_canonical_flat_shape():
    spec = build_function_tool_spec(
        name="browser",
        description="Browser tool",
        parameters={"type": "object", "properties": {"action": {"type": "string"}}},
        strict=False,
    )

    assert spec == {
        "type": "function",
        "name": "browser",
        "description": "Browser tool",
        "strict": False,
        "parameters": {
            "type": "object",
            "properties": {"action": {"type": "string"}},
        },
    }
    assert is_function_tool_spec(spec) is True


def test_to_litellm_function_tool_wraps_canonical_flat_spec():
    spec = build_function_tool_spec(
        name="browser",
        description="Browser tool",
        parameters={"type": "object", "properties": {"action": {"type": "string"}}},
        strict=True,
    )

    converted = to_litellm_function_tool(spec)

    assert converted == {
        "type": "function",
        "function": {
            "name": "browser",
            "description": "Browser tool",
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {"action": {"type": "string"}},
            },
        },
    }


def test_to_litellm_tool_choice_normalizes_canonical_choice_payload():
    converted = to_litellm_tool_choice(
        {
            "type": "function",
            "name": "browser",
        }
    )

    assert converted == {
        "type": "function",
        "function": {"name": "browser"},
    }
