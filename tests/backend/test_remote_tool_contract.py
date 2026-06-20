"""Covers remote tool contract behavior in the backend test suite."""

from pathlib import Path
from importlib import import_module
import sys

from backend.src.tools.tool_catalog import get_all_remote_tool_classes

DERIVED_BACKEND_GROUNDING_TOOLS = {
    "grounded_mouse_action",
    "grounded_scroll_action",
}


def _snapshot_tools_modules() -> dict[str, object]:
    return {
        name: module
        for name, module in sys.modules.items()
        if name == "tools" or name.startswith("tools.")
    }


def _restore_import_state(
    *,
    sys_path: list[str],
    tools_modules: dict[str, object],
) -> None:
    sys.path[:] = sys_path
    for name in list(sys.modules):
        if name == "tools" or name.startswith("tools."):
            sys.modules.pop(name, None)
    sys.modules.update(tools_modules)


def _load_local_runtime_exposed_tool_names() -> set[str]:
    repo_root = Path(__file__).resolve().parents[2]
    local_runtime_python_dir = repo_root / "frontend" / "src" / "main" / "python"
    local_runtime_python_path = str(local_runtime_python_dir)
    original_sys_path = list(sys.path)
    original_tools_modules = _snapshot_tools_modules()

    try:
        for name in list(sys.modules):
            if name == "tools" or name.startswith("tools."):
                sys.modules.pop(name, None)
        if local_runtime_python_path not in sys.path:
            sys.path.insert(0, local_runtime_python_path)

        registry_module = import_module("tools.registry")
        return registry_module.ToolRegistry.get_exposed_tool_names()
    finally:
        _restore_import_state(
            sys_path=original_sys_path,
            tools_modules=original_tools_modules,
        )


def test_backend_remote_tools_match_local_runtime_exposed_tools():
    backend_remote_tools = set(get_all_remote_tool_classes().keys())
    local_runtime_exposed_tools = _load_local_runtime_exposed_tool_names()
    backend_executable_tools = backend_remote_tools - DERIVED_BACKEND_GROUNDING_TOOLS

    missing_in_backend = sorted(local_runtime_exposed_tools - backend_executable_tools)
    missing_in_local_runtime = sorted(
        backend_executable_tools - local_runtime_exposed_tools
    )

    assert backend_executable_tools == local_runtime_exposed_tools, (
        "Remote tool contract drift detected.\n"
        f"Missing in backend remote schemas: {missing_in_backend}\n"
        f"Missing in local-runtime exposed tool set: {missing_in_local_runtime}"
    )


def test_local_runtime_registry_import_does_not_pollute_backend_import_state():
    original_sys_path = list(sys.path)
    original_tools_modules = _snapshot_tools_modules()

    _load_local_runtime_exposed_tool_names()

    assert sys.path == original_sys_path
    assert _snapshot_tools_modules() == original_tools_modules
