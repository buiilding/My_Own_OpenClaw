from backend.src.agent.tools.processing.tool_output_projection import (
    DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT,
    canonicalize_tool_result_for_model,
)
from backend.src.core.interfaces.tool import ToolResult


def test_canonical_tool_output_keeps_display_and_truncates_model_content():
    long_output = "a" * ((DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT * 4) + 500)
    result = canonicalize_tool_result_for_model(
        ToolResult(
            success=True,
            data={
                "return_display": long_output,
                "llm_content": long_output,
            },
        )
    )

    assert result.return_display == long_output
    assert result.data["display_content"] == long_output
    assert result.data["llm_content_truncated"] is True
    assert result.data["llm_content_original_tokens"] > DEFAULT_TOOL_OUTPUT_TOKEN_LIMIT
    assert result.data["model_llm_content"] == result.llm_content
    assert "tool output truncated" in result.llm_content
    assert result.format_for_history("read_file") == result.data["model_llm_content"]


def test_format_for_history_prefers_model_llm_content_over_display_fields():
    result = ToolResult(
        success=True,
        data={
            "display_content": "full visible output",
            "model_llm_content": "bounded model output",
            "llm_content": "legacy model output",
        },
        llm_content="legacy top-level output",
    )

    assert result.format_for_history("shell") == "bounded model output"
