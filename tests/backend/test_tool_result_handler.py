import pytest

from backend.src.agent.tools.waiting.handler import ToolResultHandler
from backend.src.core.interfaces.tool import ToolResult


class DummyReceiver:
    def __init__(self):
        self.calls = []

    def receive_individual_result(self, request_id, success, result_data, error):
        self.calls.append(("individual", request_id))
        return ToolResult(success=success)

    def receive_bundle_result(self, bundle_id, status, step_results, screenshot, screenshot_ref, system_state, error):
        self.calls.append(("bundle", bundle_id))
        return ToolResult(success=True)


class DummyRouter:
    def __init__(self):
        self.calls = []

    async def route_result(self, correlation_id, tool_result, *, route_mode):
        self.calls.append(("shared", correlation_id, route_mode))

    async def route_individual_result(self, request_id, tool_result):
        self.calls.append(("individual", request_id))

    async def route_bundle_result(self, bundle_id, tool_result):
        self.calls.append(("bundle", bundle_id))


@pytest.mark.asyncio
async def test_process_frontend_tool_result_routes_individual():
    receiver = DummyReceiver()
    router = DummyRouter()
    handler = ToolResultHandler(receiver, router)

    await handler.process_frontend_tool_result(
        request_id="req-1",
        success=True,
        result_data={"ok": True},
        error=None,
    )

    assert ("individual", "req-1") in receiver.calls
    assert ("shared", "req-1", "individual") in router.calls


@pytest.mark.asyncio
async def test_process_frontend_tool_result_routes_individual_for_non_dict_payload():
    receiver = DummyReceiver()
    router = DummyRouter()
    handler = ToolResultHandler(receiver, router)

    await handler.process_frontend_tool_result(
        request_id="req-2",
        success=True,
        result_data=["bundled", True],
        error=None,
    )

    assert ("individual", "req-2") in receiver.calls
    assert ("shared", "req-2", "individual") in router.calls


@pytest.mark.asyncio
async def test_process_frontend_tool_bundle_result():
    receiver = DummyReceiver()
    router = DummyRouter()
    handler = ToolResultHandler(receiver, router)

    await handler.process_frontend_tool_bundle_result(
        bundle_id="bundle-1",
        status="success",
        step_results=[],
        screenshot=None,
        screenshot_ref=None,
        system_state=None,
        error=None,
    )

    assert ("bundle", "bundle-1") in receiver.calls
    assert ("shared", "bundle-1", "bundle") in router.calls
