from backend.src.agent.tools.processing import tool_output_projection as projection
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


def test_canonical_tool_output_uses_model_token_service_when_model_is_available(
    monkeypatch,
):
    class FakeTokenService:
        def __init__(self):
            self.calls = []

        def truncate_text(self, text, *, model, token_limit, marker):
            self.calls.append(
                {
                    "model": model,
                    "token_limit": token_limit,
                    "marker": marker,
                }
            )
            return (
                f"bounded content{marker}tail",
                len(text.split()),
                True,
                "fake-tokenizer",
            )

    fake_token_service = FakeTokenService()
    monkeypatch.setattr(
        projection,
        "get_token_service",
        lambda: fake_token_service,
    )
    long_output = "hello world " * 200

    result = canonicalize_tool_result_for_model(
        ToolResult(
            success=True,
            data={
                "display_content": long_output,
                "llm_content": long_output,
            },
        ),
        token_limit=40,
        model_id="gpt-4o",
    )

    assert result.data["llm_content_truncated"] is True
    assert result.data["llm_content_token_source"] == "fake-tokenizer"
    assert result.data["llm_content_original_tokens"] == len(long_output.split())
    assert result.data["model_llm_content"] == result.llm_content
    assert "original 400 tokens, limit 40 tokens" in result.llm_content
    assert fake_token_service.calls == [
        {
            "model": "gpt-4o",
            "token_limit": 40,
            "marker": (
                "\n\n...[tool output truncated: original token count calculated below, "
                "limit 40 tokens]...\n\n"
            ),
        },
        {
            "model": "gpt-4o",
            "token_limit": 40,
            "marker": (
                "\n\n...[tool output truncated: original 400 tokens, "
                "limit 40 tokens]...\n\n"
            ),
        },
    ]
