import asyncio
import json
from pathlib import Path

from tools.manifest import build_execution_schema, build_sidecar_tool_manifest
from tools.registry import ToolRegistry


def test_build_execution_schema_exports_registered_tool_schema():
    schema = build_execution_schema("read_file")

    assert schema["type"] == "object"
    assert "file_path" in schema["properties"]
    assert "explanation" in schema["required"]


def test_registry_tool_manifest_contains_executable_schemas():
    registry = ToolRegistry()

    manifest = registry.get_tool_manifest()
    tool_names = {tool["name"] for tool in manifest["tools"]}

    assert "read_file" in tool_names
    assert "mouse_control" in tool_names
    assert all("execution_schema" in tool for tool in manifest["tools"])


def test_build_sidecar_tool_manifest_omits_unknown_schema_names():
    manifest = build_sidecar_tool_manifest({"read_file", "missing_tool"})

    assert [tool["name"] for tool in manifest["tools"]] == ["read_file"]


def test_registry_loads_extension_entrypoint_and_manifest(
    tmp_path: Path,
    monkeypatch,
):
    extension_dir = tmp_path / "notes"
    tools_dir = extension_dir / "tools"
    python_dir = extension_dir / "python"
    tools_dir.mkdir(parents=True)
    python_dir.mkdir()

    schema = {
        "type": "object",
        "properties": {"note": {"type": "string"}},
        "required": ["note"],
        "additionalProperties": False,
    }
    (tools_dir / "save_note.schema.json").write_text(
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
    (extension_dir / "extension.json").write_text(
        json.dumps(
            {
                "id": "notes",
                "tools": [
                    {
                        "name": "save_note",
                        "description": "Save a local note.",
                        "entrypoint": "python/save_note.py:run",
                        "schema": "tools/save_note.schema.json",
                        "optional": True,
                        "argument_resolution": "passthrough",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIE_AGENT_EXTENSIONS_DIR", str(tmp_path))

    registry = ToolRegistry()
    result = asyncio.run(
        registry.execute_tool("save_note", {"note": "hello", "urgent": True})
    )
    manifest = registry.get_tool_manifest()
    extension_tool_manifest = next(
        tool for tool in manifest["tools"] if tool["name"] == "save_note"
    )

    assert registry.has_tool("save_note")
    assert result.success is True
    assert result.data["llm_content"] == "saved:hello"
    assert result.data["return_display"] == "urgent:True"
    assert extension_tool_manifest["execution_schema"] == {
        "type": "object",
        "properties": {
            "note": {"type": "string"},
            "urgent": {"type": "boolean"},
        },
        "required": ["note"],
        "additionalProperties": False,
    }
    assert extension_tool_manifest["execution_schema"] != schema
