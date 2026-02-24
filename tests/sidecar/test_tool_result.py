from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.result import ToolResult  # noqa: E402


def test_tool_result_to_dict_preserves_empty_data_dict():
    result = ToolResult.success_result({}).to_dict()

    assert result == {"success": True, "data": {}}


def test_tool_result_to_dict_preserves_empty_error_string():
    result = ToolResult(success=False, error="").to_dict()

    assert result == {"success": False, "error": ""}
