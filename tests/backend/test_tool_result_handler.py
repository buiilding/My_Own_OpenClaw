import pytest

from backend.src.agent.tools.waiting.handler import ToolResultHandler
from backend.src.core.interfaces.tool import ToolResult


class DummyReceiver:
    def __init__(self):
        self.calls = []

    def receive_bundled_results(self, result_data, request_id):
        self.calls.append(("bundled", request_id))
        return [("req-1", ToolResult(success=True))], ToolResult(success=True), "shot"

    def receive_individual_result(self, request_id, success, result_data, error, metadata):
        self.calls.append(("individual", request_id))
        return ToolResult(success=success)

    def receive_bundle_result(self, bundle_id, status, step_results, screenshot, system_state, error):
        self.calls.append(("bundle", bundle_id))
        return ToolResult(success=True)


class DummyRouter:
    def __init__(self):
        self.calls = []

    async def route_bundled_results(self, request_id, individual_results, combined_result, bundle_screenshot):
        self.calls.append(("bundled", request_id))

    async def route_individual_result(self, request_id, tool_result):
        self.calls.append(("individual", request_id))

    async def route_bundle_result(self, bundle_id, tool_result):
        self.calls.append(("bundle", bundle_id))


@pytest.mark.asyncio
async def test_process_frontend_tool_result_routes_bundled():
    receiver = DummyReceiver()
    router = DummyRouter()
    handler = ToolResultHandler(receiver, router)

    await handler.process_frontend_tool_result(
        request_id="bundle-req",
        success=True,
        result_data={"bundled": True},
        error=None,
        metadata={},
    )

    assert ("bundled", "bundle-req") in receiver.calls
    assert ("bundled", "bundle-req") in router.calls


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
        metadata={},
    )

    assert ("individual", "req-1") in receiver.calls
    assert ("individual", "req-1") in router.calls


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
        system_state=None,
        error=None,
    )

    assert ("bundle", "bundle-1") in receiver.calls
    assert ("bundle", "bundle-1") in router.calls
