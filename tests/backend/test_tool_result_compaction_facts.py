"""Covers tool result compaction facts behavior in the backend test suite."""

import pytest

from backend.src.agent.tools.processing.transformer import ResultTransformer
from backend.src.core.interfaces.tool import ToolResult


@pytest.mark.asyncio
async def test_result_transformer_preserves_explicit_compaction_facts():
    transformer = ResultTransformer()
    result = ToolResult(
        success=True,
        output="clicked email row",
        compaction_facts={"action": "click", "ref": 42293},
    )

    processed = await transformer.transform("browser", result)

    assert processed.compaction_facts == {
        "tool_name": "browser",
        "success": True,
        "action": "click",
        "ref": 42293,
    }


@pytest.mark.asyncio
async def test_result_transformer_builds_bounded_compaction_facts_from_tool_payload():
    transformer = ResultTransformer()
    result = ToolResult(
        success=False,
        error="captured Outlook UI chrome instead of email body",
        output="browser read failed",
        data={
            "action": "read_long_content",
            "url": "https://outlook.office.com/mail/",
            "screenshot": "raw-image-data",
            "nested": {"ref": 42293, "status": "preview-only"},
        },
        metadata={"request_id": "req-1"},
    )

    processed = await transformer.transform("browser", result)

    assert processed.compaction_facts["tool_name"] == "browser"
    assert processed.compaction_facts["success"] is False
    assert processed.compaction_facts["error"] == "captured Outlook UI chrome instead of email body"
    assert processed.compaction_facts["data"]["action"] == "read_long_content"
    assert processed.compaction_facts["data"]["nested"]["ref"] == 42293
    assert "screenshot" not in processed.compaction_facts["data"]
