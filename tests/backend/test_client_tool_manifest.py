from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.cache_manager import CacheManager
from backend.src.core.observability.trust_boundary_metrics import MetricsService
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


def _metrics_service():
    return MetricsService()


def test_client_tool_manifest_accepts_passthrough_sidecar_tool():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "my_tool",
                    "description": "A developer-defined local tool.",
                    "execution_target": "sidecar",
                    "schema": _schema(),
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert result.rejected == []
    assert result.accepted_tool_names == ["my_tool"]
    assert result.to_public_dict()["accepted"][0]["schema"] == _schema()
    assert "optional" not in result.to_public_dict()["accepted"][0]
    assert "execution_schema" not in result.to_public_dict()["accepted"][0]
    assert result.accepted_tool_schemas[0]["name"] == "my_tool"
    assert result.accepted_tool_schemas[0]["parameters"]["required"] == ["value"]


def test_client_tool_manifest_accepts_flat_function_tool_schema():
    function_schema = {
        "type": "function",
        "name": "client_name",
        "description": "Client function description.",
        "strict": True,
        "parameters": _schema(required=["value"]),
    }

    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "manifest_name",
                    "description": "Manifest description wins when schema is silent.",
                    "execution_target": "sidecar",
                    "schema": function_schema,
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert result.rejected == []
    assert result.accepted_tool_names == ["manifest_name"]
    assert result.to_public_dict()["accepted"][0]["schema"] == function_schema
    assert result.accepted_tool_schemas == [
        {
            "type": "function",
            "name": "manifest_name",
            "description": "Client function description.",
            "strict": True,
            "parameters": _schema(required=["value"]),
        }
    ]


def test_client_tool_manifest_rejects_bad_flat_function_tool_schema():
    missing_parameters = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "broken_function",
                    "description": "Missing parameter schema.",
                    "execution_target": "sidecar",
                    "schema": {
                        "type": "function",
                        "name": "broken_function",
                    },
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )
    bad_parameters = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "bad_function",
                    "description": "Unsupported nested parameter key.",
                    "execution_target": "sidecar",
                    "schema": {
                        "type": "function",
                        "name": "bad_function",
                        "parameters": {
                            "type": "object",
                            "x-unsupported": True,
                        },
                    },
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert missing_parameters.rejected == [
        {
            "name": "broken_function",
            "reason": "invalid schema: function schema must include a non-empty name and parameters object",
        }
    ]
    assert bad_parameters.rejected == [
        {
            "name": "bad_function",
            "reason": "invalid schema: unsupported schema key 'x-unsupported'",
        }
    ]


def test_client_tool_manifest_rejects_reserved_backend_tool_collision():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "web_search",
                    "description": "Attempt to override backend search.",
                    "execution_target": "sidecar",
                    "schema": _schema(),
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
                    "schema": _schema(),
                    "argument_resolution": "passthrough",
                },
                {
                    "name": "my_tool",
                    "description": "Duplicate local tool.",
                    "execution_target": "sidecar",
                    "schema": _schema(),
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
                    "schema": {"type": "object", "x-unsupported": True},
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
                    "schema": {
                        "type": "object",
                        "description": "x" * (MAX_SCHEMA_BYTES + 1),
                    },
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert bad_key.rejected[0]["reason"].startswith("invalid schema")
    assert oversized.rejected == [
        {
            "name": "too_large",
            "reason": "invalid schema: schema exceeds size limit",
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
                    "schema": _schema(),
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
                    "schema": _schema(),
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


def test_client_tool_manifest_rejects_backend_only_grounded_helpers():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "grounded_mouse_action",
                    "description": "Attempt to claim a backend helper.",
                    "execution_target": "sidecar",
                    "schema": _schema(),
                    "argument_resolution": "backend_grounding",
                }
            ]
        }
    )

    assert result.accepted == []
    assert result.rejected == [
        {
            "name": "grounded_mouse_action",
            "reason": "reserved backend tool name",
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
                    "schema": _schema(),
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


def test_client_tool_manifest_preserves_executable_schema_metadata():
    executable_schema = {
        "type": "object",
        "properties": {"x": {"type": "integer"}},
        "required": ["x"],
    }
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "grounded_click",
                    "description": "A grounded local tool.",
                    "execution_target": "sidecar",
                    "schema": _schema(),
                    "executable_schema": executable_schema,
                    "argument_resolution": "backend_grounding",
                }
            ]
        }
    )

    assert result.rejected == []
    assert result.accepted[0].executable_schema == executable_schema
    assert (
        result.to_public_dict()["accepted"][0]["executable_schema"] == executable_schema
    )


def test_client_tool_manifest_rejects_invalid_executable_schema_metadata():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "bad_executable_schema",
                    "description": "A malformed local tool.",
                    "execution_target": "sidecar",
                    "schema": _schema(),
                    "executable_schema": {"type": "object", "x-unsupported": True},
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )

    assert result.accepted == []
    assert result.rejected == [
        {
            "name": "bad_executable_schema",
            "reason": "invalid executable_schema: unsupported schema key 'x-unsupported'",
        }
    ]


def test_client_tool_manifest_uses_client_schema_for_builtin_tools():
    result = validate_client_tool_manifest(
        {
            "tools": [
                {
                    "name": "read_file",
                    "description": "Client-owned read file schema.",
                    "execution_target": "sidecar",
                    "schema": _schema(),
                    "argument_resolution": "passthrough",
                }
            ]
        }
    )
    assert result.rejected == []
    assert result.accepted_tool_schemas == [
        {
            "type": "function",
            "name": "read_file",
            "description": "Client-owned read file schema.",
            "strict": False,
            "parameters": _schema(),
        }
    ]
    assert result.to_public_dict()["accepted"][0]["description"] == (
        "Client-owned read file schema."
    )


def test_prompt_constructor_merges_client_tool_schemas_after_policy(monkeypatch):
    monkeypatch.setattr(
        "backend.src.tools.tool_policy.load_tool_selection", lambda: None
    )
    config = AppConfig(agent_available_tools=["my_tool"])
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    constructor = PromptConstructor(
        registry, config, metrics_service=_metrics_service(), system_prompt="base"
    )
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
    constructor = PromptConstructor(
        registry, config, metrics_service=_metrics_service(), system_prompt="base"
    )
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
    constructor = PromptConstructor(
        registry, config, metrics_service=_metrics_service(), system_prompt="base"
    )
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
    constructor = PromptConstructor(
        registry, AppConfig(), metrics_service=_metrics_service(), system_prompt="base"
    )
    constructor.client_prompt_layers = [
        {"id": "later", "type": "custom", "priority": 80, "content": "later text"},
        {"id": "first", "type": "agents_md", "priority": 40, "content": "first text"},
    ]

    messages, _tool_schemas, metadata = constructor.build_prompt(
        [], include_tools=False
    )

    assert messages[0] == {"role": "system", "content": "base"}
    assert messages[1]["content"].startswith("# Client prompt layer: first")
    assert messages[2]["content"].startswith("# Client prompt layer: later")
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
