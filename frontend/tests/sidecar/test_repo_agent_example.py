"""Covers local-runtime repo-agent extension example behavior."""

from pathlib import Path

import pytest

from tools.registry import ToolRegistry


@pytest.mark.asyncio
async def test_repo_agent_example_extension_executes():
    repo_root = Path(__file__).resolve().parents[2]
    extension_dir = repo_root / "examples" / "repo-agent-extension"

    registry = ToolRegistry()
    result = registry.register_plugin_tools(plugin_path=str(extension_dir))

    assert result["errors"] == []
    assert any(tool["name"] == "read_repo_snapshot" for tool in result["registered_tools"])

    tool_result = await registry.execute_tool(
        "read_repo_snapshot",
        {
            "root": str(repo_root),
            "max_files": 5,
        },
    )

    assert tool_result.success is True
    assert "Repo snapshot for" in tool_result.data["output"]
    assert tool_result.data["files"]
