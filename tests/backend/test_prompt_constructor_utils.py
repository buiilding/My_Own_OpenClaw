import json

from backend.src.core.config.models import AppConfig
from backend.src.llm.prompts.prompt_constructor import PromptConstructor


class DummyRegistry:
    def __init__(self, schemas=None):
        self._schemas = schemas or []

    def get_function_declarations(self):
        return self._schemas


def _make_constructor(tool_schemas=None):
    return PromptConstructor(
        tool_registry=DummyRegistry(tool_schemas),
        config=AppConfig(),
        system_prompt="system",
    )


def test_extract_xml_tag_handles_attributes_with_gt_character():
    constructor = _make_constructor()
    content = (
        '<system_context code="if a > b: c" note="x">'
        "payload"
        "</system_context>"
    )

    extracted = constructor._extract_xml_tag(content, "system_context")

    assert extracted == content


def test_extract_xml_tag_content_returns_stripped_inner_text():
    constructor = _make_constructor()
    content = (
        '<active_window title="a > b">\n'
        "  My App  \n"
        "</active_window>"
    )

    extracted = constructor._extract_xml_tag_content(content, "active_window")

    assert extracted == "My App"


def test_format_user_message_content_adds_tool_schemas_only_for_first_message():
    tool_schemas = [{"name": "read_file", "parameters": {"type": "object"}}]
    constructor = _make_constructor(tool_schemas)

    first_content = constructor.format_user_message_content(
        message_content="<user_query>hello</user_query>",
        query="hello",
        is_first_message=True,
    )
    later_content = constructor.format_user_message_content(
        message_content="<user_query>hello</user_query>",
        query="hello",
        is_first_message=False,
    )

    assert "<tool_schemas>" in first_content
    assert "<tool_schemas>" not in later_content
    encoded = first_content.split("<tool_schemas>\n", 1)[1].split("\n</tool_schemas>", 1)[0]
    assert json.loads(encoded) == tool_schemas


def test_format_user_message_content_respects_allowlist_for_tool_schemas():
    constructor = PromptConstructor(
        tool_registry=DummyRegistry(
            [
                {"name": "read_file", "parameters": {"type": "object"}},
                {"name": "secret_tool", "parameters": {"type": "object"}},
            ]
        ),
        config=AppConfig(interaction_mode="chat"),
        system_prompt="system",
    )

    first_content = constructor.format_user_message_content(
        message_content="<user_query>hello</user_query>",
        query="hello",
        is_first_message=True,
    )

    encoded = first_content.split("<tool_schemas>\n", 1)[1].split("\n</tool_schemas>", 1)[0]
    schemas = json.loads(encoded)

    assert [schema["name"] for schema in schemas] == ["read_file"]
