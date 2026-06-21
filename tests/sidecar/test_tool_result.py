"""Covers local-runtime tool result behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.result import ToolResult  # noqa: E402


def test_tool_result_to_dict_preserves_empty_data_dict():
    result = ToolResult.success_result({}).to_dict()

    assert result == {"success": True, "data": {"output": ""}}


def test_tool_result_to_dict_uses_only_canonical_output_for_model_text():
    result = ToolResult.success_result(
        {
            "snapshot": "visible browser text",
            "extracted_content": "extracted browser text",
            "output": "model text",
        }
    ).to_dict()

    assert result == {
        "success": True,
        "data": {
            "snapshot": "visible browser text",
            "extracted_content": "extracted browser text",
            "output": "model text",
        },
    }


def test_tool_result_to_dict_preserves_empty_error_string():
    result = ToolResult(success=False, error="").to_dict()

    assert result == {"success": False, "error": ""}
