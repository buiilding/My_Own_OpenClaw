import asyncio

import pytest

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedResponse, ParsedToolCall
from backend.src.tools.bundle_execution import execute_bundle
from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage


class DummySession:
    def __init__(self):
        self._tool_result_storage = ToolResultStorage()


def _make_response(bundle_id="bundle"):
    calls = [
        ParsedToolCall(tool_name="read_file", parameters={}, raw_call="{}", metadata={"bundle_id": bundle_id}),
        ParsedToolCall(tool_name="write_file", parameters={}, raw_call="{}", metadata={"bundle_id": bundle_id}),
    ]
    return ParsedResponse(original_response="{}", tool_calls=calls, text_content="", has_tool_calls=True)


@pytest.mark.asyncio
async def test_execute_bundle_uses_existing_result():
    session = DummySession()
    response = _make_response()

    bundle_result = ToolResult(
        success=True,
        data={
            "step_results": [
                {"status": "ok", "output": "done"},
                {"status": "ok", "output": "saved"},
            ],
            "screenshot": "shot",
        },
    )
    session._tool_result_storage.store_bundled_result("bundle", bundle_result)

    result = await execute_bundle(response, "bundle", session)

    assert len(result.tool_results) == 2
    assert session._tool_result_storage.get_bundle_future("bundle") is None
    assert result.tool_results[0].result.success is True
    assert "done" in (result.tool_results[0].result.llm_content or "")
    assert result.tool_results[1].result.success is True


@pytest.mark.asyncio
async def test_execute_bundle_timeout(monkeypatch):
    session = DummySession()
    response = _make_response("bundle-timeout")

    async def fake_wait_for(_future, timeout=None):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

    result = await execute_bundle(response, "bundle-timeout", session)

    assert len(result.tool_results) == 2
    assert result.tool_results[0].result.success is False
    assert "timed out" in (result.tool_results[0].result.error or "").lower()
