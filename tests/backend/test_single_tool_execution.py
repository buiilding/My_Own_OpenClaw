import pytest
from types import SimpleNamespace

from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.single_tool_execution import execute_single_tool


class DummySession:
    def __init__(self, resolved_call=None, current_screenshot_id=None):
        self._result_storage = ToolResultStorage()
        self._resolved_call = resolved_call
        self._current_screenshot_id = current_screenshot_id

    def get_resolved_tool_call(self, request_id):
        return self._resolved_call

    def get_result_storage(self):
        return self._result_storage

    def get_current_screenshot_id(self):
        return self._current_screenshot_id


def _parsed_tool_call(tool_name: str, parameters: dict | None = None, request_id: str | None = None):
    metadata = {"request_id": request_id} if request_id is not None else None
    return ParsedToolCall(
        tool_name=tool_name,
        parameters=parameters or {},
        raw_call="{}",
        metadata=metadata,
    )


def _assert_pending_result_consumed(session: DummySession, request_id: str) -> None:
    storage = session.get_result_storage()
    assert storage.get_pending_result(request_id) is None
    assert storage.get_result_future(request_id) is None


def _store_pending_result(
    session: DummySession,
    request_id: str,
    *,
    payload: dict | None = None,
) -> ToolResult:
    result = ToolResult(success=True, data=payload or {"ok": True})
    session.get_result_storage().store_pending_result(request_id, result)
    return result


@pytest.mark.asyncio
async def test_execute_single_tool_missing_request_id_returns_placeholder():
    session = DummySession()
    tool_call = _parsed_tool_call("click")

    result_obj = await execute_single_tool(tool_call, session)

    assert result_obj.success is True
    assert result_obj.result.data["status"] == "pending_frontend_execution"
    assert "executing on frontend" in (result_obj.result.llm_content or "")


@pytest.mark.asyncio
async def test_execute_single_tool_stale_screen_fails_fast():
    resolved_call = SimpleNamespace(
        metadata={"coordinate_resolution_screenshot_id": "old-shot"}
    )
    session = DummySession(resolved_call=resolved_call, current_screenshot_id="new-shot")
    tool_call = _parsed_tool_call("click", request_id="req-1")

    result_obj = await execute_single_tool(tool_call, session)

    assert result_obj.success is False
    assert "screen changed" in (result_obj.result.error or "").lower()


@pytest.mark.asyncio
async def test_execute_single_tool_uses_pending_result():
    session = DummySession()
    tool_call = _parsed_tool_call("type", request_id="req-1")
    pending_result = _store_pending_result(session, "req-1")

    result_obj = await execute_single_tool(tool_call, session)

    assert result_obj.result is pending_result
    _assert_pending_result_consumed(session, "req-1")


@pytest.mark.asyncio
async def test_execute_single_tool_resolved_call_without_to_parsed_call():
    resolved_call = SimpleNamespace(
        tool_name="click",
        parameters={"x": 100, "y": 200},
        raw_call='{"functionCall":{"name":"click","args":{"x":100,"y":200}}}',
        metadata={
            "request_id": "req-1",
            "coordinate_resolution_screenshot_id": "same-shot",
        },
    )
    session = DummySession(
        resolved_call=resolved_call,
        current_screenshot_id="same-shot",
    )

    tool_call = _parsed_tool_call("click", {"x": 1, "y": 2}, request_id="req-1")
    pending_result = _store_pending_result(session, "req-1")

    result_obj = await execute_single_tool(tool_call, session)

    assert result_obj.result is pending_result
    _assert_pending_result_consumed(session, "req-1")
    assert result_obj.tool_call.parameters == {"x": 100, "y": 200}
    assert result_obj.tool_call.metadata == resolved_call.metadata
