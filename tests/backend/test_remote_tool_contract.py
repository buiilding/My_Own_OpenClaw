from pathlib import Path
from importlib import import_module
import sys

from backend.src.tools.remote import get_all_remote_tools


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


def _load_frontend_exposed_tool_names() -> set[str]:
    repo_root = Path(__file__).resolve().parents[2]
    frontend_python_dir = repo_root / "frontend" / "src" / "main" / "python"
    frontend_python_path = str(frontend_python_dir)
    original_sys_path = list(sys.path)
    original_tools_modules = _snapshot_tools_modules()

    try:
        for name in list(sys.modules):
            if name == "tools" or name.startswith("tools."):
                sys.modules.pop(name, None)
        if frontend_python_path not in sys.path:
            sys.path.insert(0, frontend_python_path)

        registry_module = import_module("tools.registry")
        return registry_module.ToolRegistry.get_exposed_tool_names()
    finally:
        _restore_import_state(
            sys_path=original_sys_path,
            tools_modules=original_tools_modules,
        )


def test_backend_remote_tools_match_frontend_exposed_tools():
    backend_remote_tools = set(get_all_remote_tools().keys())
    frontend_exposed_tools = _load_frontend_exposed_tool_names()

    missing_in_backend = sorted(frontend_exposed_tools - backend_remote_tools)
    missing_in_frontend = sorted(backend_remote_tools - frontend_exposed_tools)

    assert backend_remote_tools == frontend_exposed_tools, (
        "Remote tool contract drift detected.\n"
        f"Missing in backend remote schemas: {missing_in_backend}\n"
        f"Missing in frontend exposed tool set: {missing_in_frontend}"
    )


def test_frontend_registry_import_does_not_pollute_backend_import_state():
    original_sys_path = list(sys.path)
    original_tools_modules = _snapshot_tools_modules()

    _load_frontend_exposed_tool_names()

    assert sys.path == original_sys_path
    assert _snapshot_tools_modules() == original_tools_modules
