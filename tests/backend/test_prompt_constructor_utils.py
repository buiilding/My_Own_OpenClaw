import pytest

from backend.src.core.config.models import AppConfig
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.llm.prompts.prompt_constructor import PromptConstructor
from backend.src.tools.remote import RemoteMouseTool


class DummyRegistry:
    def __init__(self, schemas=None):
        self._schemas = schemas or []

    def get_function_declarations(self):
        return self._schemas


class DummyStoredQuery:
    def __init__(self, user_query_raw):
        self.user_query_raw = user_query_raw


class DummyStoredEntry:
    def __init__(self, message_type):
        self.message_type = message_type


class DummyHistory:
    def __init__(self, history, user_query_raw, message_types):
        self._history = history
        self.last_user_query = DummyStoredQuery(user_query_raw) if user_query_raw is not None else None
        self._stored_entries = [DummyStoredEntry(msg_type) for msg_type in message_types]

    def get_history(self):
        return self._history

    def get_stored_messages(self):
        return self._stored_entries


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
    tool_schemas = [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "parameters": {"type": "object"},
            },
        }
    ]
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

    assert first_content == "<user_query>hello</user_query>"
    assert later_content == "<user_query>hello</user_query>"
    assert "<tool_schemas>" not in first_content
    assert "<tool_schemas>" not in later_content


def test_format_user_message_content_respects_allowlist_for_tool_schemas():
    constructor = PromptConstructor(
        tool_registry=DummyRegistry(
            [
                {
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "parameters": {"type": "object"},
                    },
                },
                {
                    "type": "function",
                    "function": {
                        "name": "secret_tool",
                        "parameters": {"type": "object"},
                    },
                },
            ]
        ),
        config=AppConfig(interaction_mode="chat"),
        system_prompt="system",
    )

    _prompt_messages, schemas, _metadata = constructor.build_prompt(None, include_tools=True)

    assert [schema["function"]["name"] for schema in schemas] == ["read_file"]


def test_format_user_message_content_filters_mouse_coordinate_methods(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
):
    config_path = tmp_path / "tool_selection.toml"
    config_path.write_text(
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(config_path))

    constructor = PromptConstructor(
        tool_registry=DummyRegistry([RemoteMouseTool().get_json_schema()]),
        config=AppConfig(interaction_mode="agent"),
        system_prompt="system",
    )

    _prompt_messages, schemas, _metadata = constructor.build_prompt(None, include_tools=True)
    mouse_schema = schemas[0]

    args_props = mouse_schema["function"]["parameters"]["properties"]
    method_schema = args_props["find_coordinates_by"]

    assert method_schema["enum"] == ["manual"]
    assert "x" in args_props
    assert "y" in args_props
    assert "ocr_text" not in args_props
    assert "description" not in args_props
    assert "model_name" not in args_props


def test_build_prompt_populates_user_message_metadata_from_history():
    constructor = _make_constructor(
        [
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "parameters": {"type": "object"},
                },
            }
        ]
    )
    history = DummyHistory(
        history=[
            {
                "role": MessageRole.USER.value,
                "content": (
                    "<system_context><active_window>Editor</active_window></system_context>"
                    "<user_query>open file</user_query>"
                ),
            }
        ],
        user_query_raw="open file",
        message_types=[MessageType.USER_QUERY],
    )

    prompt_messages, tool_schemas, metadata = constructor.build_prompt(history, include_tools=True)

    assert prompt_messages == history.get_history()
    assert tool_schemas == [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "parameters": {"type": "object"},
            },
        }
    ]
    assert metadata.user_message_metadata is not None
    assert metadata.user_message_metadata.original_query == "open file"
    assert metadata.user_message_metadata.context_type == "initial"
    assert metadata.user_message_metadata.active_window == "Editor"
    assert metadata.user_message_metadata.injected_context == "<system_context><active_window>Editor</active_window></system_context>"


def test_build_prompt_sets_sequential_context_when_multiple_user_queries():
    constructor = _make_constructor()
    history = DummyHistory(
        history=[
            {"role": MessageRole.USER.value, "content": "<user_query>q1</user_query>"},
            {"role": MessageRole.USER.value, "content": "<user_query>q2</user_query>"},
        ],
        user_query_raw="q2",
        message_types=[MessageType.USER_QUERY, MessageType.USER_QUERY],
    )

    _prompt_messages, _tool_schemas, metadata = constructor.build_prompt(history, include_tools=False)

    assert metadata.user_message_metadata is not None
    assert metadata.user_message_metadata.context_type == "sequential"
    assert metadata.user_message_metadata.full_content == "<user_query>q2</user_query>"


def test_build_prompt_returns_empty_history_and_no_user_metadata_without_store():
    constructor = _make_constructor()

    prompt_messages, tool_schemas, metadata = constructor.build_prompt(None, include_tools=False)

    assert prompt_messages == []
    assert tool_schemas == []
    assert metadata.user_message_metadata is None
