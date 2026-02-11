import pytest

from backend.src.agent.tools.waiting.handler import ToolResultHandler
from backend.src.core.interfaces.tool import ToolResult


class DummyReceiver:
    def __init__(self):
        self.calls = []
        self.last_metadata = None

    def receive_bundled_results(self, result_data, request_id):
        self.calls.append(("bundled", request_id))
        return [("req-1", ToolResult(success=True))], ToolResult(success=True), "shot"

    def receive_individual_result(self, request_id, success, result_data, error, metadata):
        self.calls.append(("individual", request_id))
        self.last_metadata = metadata
        return ToolResult(success=success)

    def receive_bundle_result(self, bundle_id, status, step_results, screenshot, screenshot_ref, system_state, error):
        self.calls.append(("bundle", bundle_id))
        return ToolResult(success=True)


class DummyRouter:
    def __init__(self):
        self.calls = []

    async def route_result(self, correlation_id, tool_result, *, route_mode):
        self.calls.append(("shared", correlation_id, route_mode))

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
        metadata={},
    )

    assert ("individual", "req-2") in receiver.calls
    assert ("shared", "req-2", "individual") in router.calls


@pytest.mark.asyncio
async def test_process_frontend_tool_result_normalizes_invalid_metadata():
    receiver = DummyReceiver()
    router = DummyRouter()
    handler = ToolResultHandler(receiver, router)

    await handler.process_frontend_tool_result(
        request_id="req-3",
        success=True,
        result_data={"ok": True},
        error=None,
        metadata=None,
    )
    assert receiver.last_metadata == {}

    await handler.process_frontend_tool_result(
        request_id="req-4",
        success=True,
        result_data={"ok": True},
        error=None,
        metadata="bad-metadata",
    )
    assert receiver.last_metadata == {}


@pytest.mark.asyncio
async def test_process_frontend_tool_result_copies_metadata_dict():
    receiver = DummyReceiver()
    router = DummyRouter()
    handler = ToolResultHandler(receiver, router)
    source_metadata = {"source": "frontend"}

    await handler.process_frontend_tool_result(
        request_id="req-5",
        success=True,
        result_data={"ok": True},
        error=None,
        metadata=source_metadata,
    )

    assert receiver.last_metadata == {"source": "frontend"}
    assert receiver.last_metadata is not source_metadata


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
