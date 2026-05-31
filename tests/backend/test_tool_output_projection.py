from backend.src.agent.tools.processing import tool_output_projection as projection
from backend.src.agent.tools.processing.tool_output_projection import (
    raw_tool_output_text,
    truncate_tool_output_for_model,
)
from backend.src.core.interfaces.tool import ToolResult


def test_raw_tool_output_prefers_output_even_when_empty() -> None:
    result = ToolResult.from_payload(
        {
            "success": True,
            "data": {
                "output": "",
                "status": "connected",
            },
        }
    )

    assert raw_tool_output_text(result) == ""


def test_truncate_tool_output_for_model_does_not_mutate_result_data() -> None:
    data = {
        "output": "abcdefghi" * 20,
        "screenshot_ref": "artifact-1",
        "capture_meta": {"source_w": 100},
    }
    result = ToolResult(success=True, data=dict(data))

    model_text = truncate_tool_output_for_model(result, token_limit=4)

    assert model_text == data["output"][:16]
    assert result.data == data
    assert "output_token_limit" not in result.data
    assert "output_truncated" not in result.data


def test_truncate_tool_output_for_model_uses_token_service_without_mutating_data(
    monkeypatch,
) -> None:
    calls = []

    class FakeTokenService:
        def truncate_text(self, text, *, model, token_limit, marker):
            calls.append(
                {
                    "text": text,
                    "model": model,
                    "token_limit": token_limit,
                    "marker": marker,
                }
            )
            return ("bounded raw output", 50, True, "fake-tokenizer")

    monkeypatch.setattr(projection, "get_token_service", lambda: FakeTokenService())
    data = {
        "output": "raw output from sidecar",
        "status": "ok",
    }
    result = ToolResult(success=True, data=dict(data))

    model_text = truncate_tool_output_for_model(
        result,
        token_limit=8,
        model_id="gpt-test",
    )

    assert model_text == "bounded raw output"
    assert result.data == data
    assert calls[0]["text"] == "raw output from sidecar"
    assert calls[0]["model"] == "gpt-test"
    assert calls[0]["token_limit"] == 8
