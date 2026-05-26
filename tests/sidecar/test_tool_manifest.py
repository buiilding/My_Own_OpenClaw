import asyncio
import json
from pathlib import Path

from tools.exposed_tool_names import EXPOSED_TO_BACKEND_TOOL_NAMES
from tools.manifest import (
    build_sidecar_capability_schema,
    build_sidecar_executable_schema,
    build_sidecar_tool_manifest,
)
from tools.registry import ToolRegistry

REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATED_MANIFEST_PATH = (
    REPO_ROOT / "frontend" / "src" / "main" / "generated" / "builtin_tool_manifest.json"
)


def test_build_sidecar_capability_schema_exports_registered_tool_schema():
    schema = build_sidecar_capability_schema("read_file")

    assert schema["type"] == "object"
    assert "file_path" in schema["properties"]
    assert "explanation" in schema["required"]


def test_build_sidecar_capability_schema_exports_rich_browser_contract():
    schema = build_sidecar_capability_schema("browser")

    assert schema["required"] == ["action", "explanation"]
    assert schema["additionalProperties"] is False
    assert "navigate" in schema["properties"]["action"]["enum"]
    assert "read_long_content" in schema["properties"]["action"]["enum"]
    assert "url" in schema["properties"]
    assert "query" in schema["properties"]
    assert "text" in schema["properties"]


def test_build_sidecar_capability_schema_exports_backend_grounding_metadata_for_desktop_tools():
    mouse_schema = build_sidecar_capability_schema("mouse_control")
    scroll_schema = build_sidecar_capability_schema("scroll_control")

    assert mouse_schema["required"] == ["action", "explanation"]
    assert mouse_schema["properties"]["find_coordinates_by"]["enum"] == [
        "manual",
        "ocr",
        "prediction",
    ]
    assert "drag_to_find_coordinates_by" in mouse_schema["properties"]
    assert scroll_schema["required"] == ["action", "explanation"]
    assert scroll_schema["properties"]["source_description"]["type"] == "string"


def test_grounded_tool_manifest_separates_backend_validation_and_executable_schema():
    manifest = build_sidecar_tool_manifest({"mouse_control", "scroll_control"})
    mouse_tool = next(tool for tool in manifest["tools"] if tool["name"] == "mouse_control")
    executable_mouse_schema = build_sidecar_executable_schema("mouse_control")

    assert mouse_tool["schema_role"] == "backend_validation"
    assert mouse_tool["schema"]["properties"]["find_coordinates_by"]["enum"] == [
        "manual",
        "ocr",
        "prediction",
    ]
    assert "find_coordinates_by" not in mouse_tool["executable_schema"]["properties"]
    assert {"x", "y"} <= set(mouse_tool["executable_schema"]["properties"])
    assert mouse_tool["executable_schema"] == executable_mouse_schema


def test_registry_tool_manifest_contains_builtin_schemas():
    registry = ToolRegistry()

    manifest = registry.get_tool_manifest()
    tool_names = {tool["name"] for tool in manifest["tools"]}

    assert "read_file" in tool_names
    assert "mouse_control" in tool_names
    assert all("description" in tool for tool in manifest["tools"])
    assert all(tool.get("execution_target") == "sidecar" for tool in manifest["tools"])
    assert all("schema" in tool for tool in manifest["tools"])
    assert all(tool.get("schema_role") == "backend_validation" for tool in manifest["tools"])
    assert all("executable_schema" in tool for tool in manifest["tools"])


def test_build_sidecar_tool_manifest_omits_unknown_schema_names():
    manifest = build_sidecar_tool_manifest({"read_file", "missing_tool"})

    assert [tool["name"] for tool in manifest["tools"]] == ["read_file"]
    assert manifest["tools"][0]["argument_resolution"] == "passthrough"


def test_generated_builtin_manifest_matches_sidecar_source():
    generated = json.loads(GENERATED_MANIFEST_PATH.read_text(encoding="utf-8"))
    expected = build_sidecar_tool_manifest(EXPOSED_TO_BACKEND_TOOL_NAMES)

    assert generated == expected


def test_registry_loads_plugin_entrypoint_and_manifest(
    tmp_path: Path,
    monkeypatch,
):
    plugin_dir = tmp_path / "plugins" / "notes"
    schemas_dir = plugin_dir / "schemas"
    python_dir = plugin_dir / "python"
    schemas_dir.mkdir(parents=True)
    python_dir.mkdir()

    schema = {
        "type": "object",
        "properties": {"note": {"type": "string"}},
        "required": ["note"],
        "additionalProperties": False,
    }
    (schemas_dir / "save_note.schema.json").write_text(
        json.dumps(schema), encoding="utf-8"
    )
    (python_dir / "save_note.py").write_text(
        "\n".join(
            [
                "from __future__ import annotations",
                "from tools.result import ToolResult",
                "",
                "async def run(note: str, urgent: bool = False):",
                "    return ToolResult.success_result({",
                "        'llm_content': f'saved:{note}',",
                "        'return_display': f'urgent:{urgent}',",
                "    })",
            ]
        ),
        encoding="utf-8",
    )
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {
                "id": "notes",
                "tools": [
                    {
                        "name": "save_note",
                        "description": "Save a local note.",
                        "entrypoint": "python/save_note.py:run",
                        "schema": "schemas/save_note.schema.json",
                        "argument_resolution": "passthrough",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIE_AGENT_CONTRIBUTIONS_DIR", str(tmp_path))

    registry = ToolRegistry()
    result = asyncio.run(
        registry.execute_tool("save_note", {"note": "hello", "urgent": True})
    )

    assert registry.has_tool("save_note")
    assert result.success is True
    assert result.data["llm_content"] == "saved:hello"
    assert result.data["return_display"] == "urgent:True"
