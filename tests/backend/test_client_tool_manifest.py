from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.llm.prompts.prompt_constructor import PromptConstructor
from backend.src.tools.client_manifest import (
    MAX_CLIENT_TOOLS,
    MAX_SCHEMA_BYTES,
    validate_client_tool_manifest,
)
from backend.src.tools.remote_tool_catalog import build_remote_tool_catalog
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
                    "parameters": _schema(),
                    "argument_resolution": "passthrough",
                    "optional": True,
                }
            ]
        }
    )

    assert result.rejected == []
    assert result.accepted_tool_names == ["my_tool"]
    assert result.accepted[0].optional is True
    assert result.to_public_dict()["accepted"][0]["optional"] is True
    assert result.accepted_tool_schemas[0]["name"] == "my_tool"
    assert result.accepted_tool_schemas[0]["parameters"]["required"] == ["value"]


def test_client_tool_manifest_accepts_execution_parameters_override():
    execution_parameters = {
        "type": "object",
        "properties": {"value": {"type": "string"}, "dry_run": {"type": "boolean"}},
        "required": ["value"],
    }

    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "my_tool",
                    "description": "A developer-defined local tool.",
                    "execution_target": "sidecar",
                    "parameters": _schema(),
                    "execution_parameters": execution_parameters,
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert result.rejected == []
    assert result.accepted[0].model_schema == _schema()
    assert result.accepted[0].execution_schema == execution_parameters


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


def test_client_tool_manifest_rejects_duplicate_tool_names():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "my_tool",
                    "description": "First local tool.",
                    "execution_target": "sidecar",
                    "model_schema": _schema(),
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                },
                {
                    "name": "my_tool",
                    "description": "Duplicate local tool.",
                    "execution_target": "sidecar",
                    "model_schema": _schema(),
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                },
            ]
        }
    )

    assert result.accepted_tool_names == ["my_tool"]
    assert result.rejected == [{"name": "my_tool", "reason": "duplicate tool name"}]


def test_client_tool_manifest_rejects_bad_and_oversized_schemas():
    bad_key = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "bad_schema",
                    "description": "Bad local tool.",
                    "execution_target": "sidecar",
                    "model_schema": {"type": "object", "x-unsupported": True},
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )
    oversized = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "too_large",
                    "description": "Large local tool.",
                    "execution_target": "sidecar",
                    "model_schema": {
                        "type": "object",
                        "description": "x" * (MAX_SCHEMA_BYTES + 1),
                    },
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert bad_key.rejected[0]["reason"].startswith("invalid parameters")
    assert oversized.rejected == [
        {
            "name": "too_large",
            "reason": "invalid parameters: schema exceeds size limit",
        }
    ]


def test_client_tool_manifest_rejects_oversized_tool_count_and_backend_addition():
    too_many = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": f"tool_{index}",
                    "description": "A local tool.",
                    "execution_target": "sidecar",
                    "model_schema": _schema(),
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                }
                for index in range(MAX_CLIENT_TOOLS + 1)
            ]
        }
    )
    backend_addition = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "custom_backend_tool",
                    "description": "Attempt to add backend execution.",
                    "execution_target": "backend",
                    "model_schema": _schema(),
                    "execution_schema": _schema(),
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert too_many.accepted == []
    assert too_many.rejected[0]["reason"].endswith(f"{MAX_CLIENT_TOOLS} tools")
    assert backend_addition.rejected == [
        {
            "name": "custom_backend_tool",
            "reason": "client manifests cannot add backend tools",
        }
    ]


def test_client_tool_manifest_accepts_backend_grounding_mode_for_sidecar_tools():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "grounded_click",
                    "description": "A grounded local tool.",
                    "execution_target": "sidecar",
                    "model_schema": _schema(),
                    "execution_schema": _schema(),
                    "argument_resolution": "backend_grounding",
                }
            ]
        }
    )

    assert result.rejected == []
    assert result.accepted[0].argument_resolution == "backend_grounding"
    assert (
        result.to_public_dict()["accepted"][0]["argument_resolution"]
        == "backend_grounding"
    )


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


def test_prompt_constructor_policy_does_not_resurrect_disabled_client_tools(
    monkeypatch,
):
    monkeypatch.setattr(
        "backend.src.tools.tool_policy.load_tool_selection", lambda: None
    )
    config = AppConfig(agent_available_tools=["allowed_tool"])
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    constructor = PromptConstructor(registry, config, system_prompt="base")
    constructor.client_tool_schemas = [
        {
            "type": "function",
            "name": "allowed_tool",
            "description": "Allowed local tool.",
            "parameters": _schema(),
        },
        {
            "type": "function",
            "name": "disabled_tool",
            "description": "Disabled local tool.",
            "parameters": _schema(),
        },
    ]

    _messages, tool_schemas, _metadata = constructor.build_prompt(
        [], include_tools=True
    )

    assert [schema["name"] for schema in tool_schemas] == ["allowed_tool"]


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


def test_remote_tool_catalog_reports_web_search_availability(monkeypatch):
    monkeypatch.setattr(
        "backend.src.tools.remote_tool_catalog.resolve_web_search_execution_mode",
        lambda _config: None,
    )
    catalog = build_remote_tool_catalog(AppConfig())

    assert catalog["remote_tools"] == [
        {
            "name": "web_search",
            "description": "Search the web through the hosted WindieOS backend.",
            "enabled": False,
            "available": False,
            "reason_unavailable": "No native provider search mode or Brave fallback is available.",
        }
    ]
