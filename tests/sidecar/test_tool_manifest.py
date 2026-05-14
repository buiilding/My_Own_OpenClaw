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
