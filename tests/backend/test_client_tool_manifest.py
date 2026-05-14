from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.llm.prompts.prompt_constructor import PromptConstructor
from backend.src.tools.client_manifest import validate_client_tool_manifest
from backend.src.tools.registry import ToolRegistry


def _schema(required=None):
    return {
        "type": "object",
        "properties": {
            "value": {"type": "string"},
        },
        "required": required or ["value"],
    }


def test_client_tool_manifest_accepts_passthrough_sidecar_tool():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "my_tool",
                    "description": "A developer-defined local tool.",
                    "execution_target": "sidecar",
                    "model_schema": _schema(),
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert result.rejected == []
    assert result.accepted_tool_names == ["my_tool"]
    assert result.accepted_tool_schemas[0]["name"] == "my_tool"
    assert result.accepted_tool_schemas[0]["parameters"]["required"] == ["value"]


def test_client_tool_manifest_rejects_reserved_backend_tool_collision():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "web_search",
                    "description": "Attempt to override backend search.",
                    "execution_target": "sidecar",
                    "model_schema": _schema(),
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert result.accepted == []
    assert result.rejected == [
        {"name": "web_search", "reason": "reserved backend tool name"}
    ]


def test_prompt_constructor_merges_client_tool_schemas_after_policy(monkeypatch):
    monkeypatch.setattr(
        "backend.src.tools.tool_policy.load_tool_selection", lambda: None
    )
    config = AppConfig(agent_available_tools=["my_tool"])
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    constructor = PromptConstructor(registry, config, system_prompt="base")
    constructor.client_tool_schemas = [
        {
            "type": "function",
            "name": "my_tool",
            "description": "A local tool.",
            "parameters": _schema(),
        },
        {
            "type": "function",
            "name": "hidden_tool",
            "description": "Should be filtered.",
            "parameters": _schema(),
        },
    ]

    _messages, tool_schemas, _metadata = constructor.build_prompt(
        [], include_tools=True
    )

    assert [schema["name"] for schema in tool_schemas] == ["my_tool"]


def test_prompt_constructor_client_schema_replaces_registry_schema(monkeypatch):
    monkeypatch.setattr(
        "backend.src.tools.tool_policy.load_tool_selection", lambda: None
    )
    config = AppConfig(agent_available_tools=["read_file"])
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    constructor = PromptConstructor(registry, config, system_prompt="base")
    constructor.client_tool_schemas = [
        {
            "type": "function",
            "name": "read_file",
            "description": "Client-owned read file schema.",
            "parameters": _schema(required=["value"]),
        },
    ]

    _messages, tool_schemas, _metadata = constructor.build_prompt(
        [], include_tools=True
    )

    assert len(tool_schemas) == 1
    assert tool_schemas[0]["name"] == "read_file"
    assert tool_schemas[0]["description"] == "Client-owned read file schema."


def test_prompt_constructor_adds_client_prompt_layers_in_priority_order():
    registry = ToolRegistry(config=AppConfig(), cache_manager=CacheManager())
    constructor = PromptConstructor(registry, AppConfig(), system_prompt="base")
    constructor.client_prompt_layers = [
        {"id": "later", "type": "custom", "priority": 80, "content": "later text"},
        {"id": "first", "type": "agents_md", "priority": 40, "content": "first text"},
    ]

    messages, _tool_schemas, metadata = constructor.build_prompt(
        [], include_tools=False
    )

    assert messages[0]["content"].startswith("# Client prompt layer: first")
    assert messages[1]["content"].startswith("# Client prompt layer: later")
    assert metadata.client_prompt_layers == [
        {
            "id": "first",
            "type": "agents_md",
            "priority": 40,
            "content": "first text",
        },
        {
            "id": "later",
            "type": "custom",
            "priority": 80,
            "content": "later text",
        },
    ]
