import sys
from pathlib import Path


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from tools.result import ToolResult  # noqa: E402


def test_tool_result_to_dict_preserves_empty_data_dict():
    result = ToolResult.success_result({}).to_dict()

    assert result == {"success": True, "data": {}}


def test_tool_result_to_dict_preserves_empty_error_string():
    result = ToolResult(success=False, error="").to_dict()

    assert result == {"success": False, "error": ""}
