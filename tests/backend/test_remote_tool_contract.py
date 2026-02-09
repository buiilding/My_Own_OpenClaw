from pathlib import Path
import sys

from backend.src.tools.remote import get_all_remote_tools


def _load_frontend_exposed_tool_names() -> set[str]:
    repo_root = Path(__file__).resolve().parents[2]
    frontend_python_dir = repo_root / "frontend" / "src" / "main" / "python"
    frontend_python_path = str(frontend_python_dir)
    if frontend_python_path not in sys.path:
        sys.path.insert(0, frontend_python_path)

    from tools.registry import ToolRegistry  # noqa: E402

    return ToolRegistry.get_exposed_tool_names()


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
