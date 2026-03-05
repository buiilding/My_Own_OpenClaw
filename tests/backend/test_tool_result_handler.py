import pytest

from backend.src.agent.tools.waiting.handler import ToolResultHandler
from backend.src.core.interfaces.tool import ToolResult


class DummyReceiver:
    def __init__(self):
        self.calls = []
        self.last_individual = None
        self.last_bundle = None

    def receive_individual_result(self, request_id, success, result_data, error):
        self.calls.append(("individual", request_id))
        self.last_individual = {
            "request_id": request_id,
            "success": success,
            "result_data": result_data,
            "error": error,
        }
        return ToolResult(success=success)

    def receive_bundle_result(
        self,
        bundle_id,
        status,
        step_results,
        screenshot,
        screenshot_ref,
        capture_meta,
        system_state,
        error,
    ):
        self.calls.append(("bundle", bundle_id))
        self.last_bundle = {
            "bundle_id": bundle_id,
            "status": status,
            "step_results": step_results,
            "screenshot": screenshot,
            "screenshot_ref": screenshot_ref,
            "capture_meta": capture_meta,
            "system_state": system_state,
            "error": error,
        }
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
        capture_meta=None,
        system_state=None,
        error=None,
    )

    assert ("bundle", "bundle-1") in receiver.calls
    assert ("shared", "bundle-1", "bundle") in router.calls


@pytest.mark.asyncio
async def test_process_frontend_tool_bundle_result_forwards_boundary_payload_shape():
    receiver = DummyReceiver()
    router = DummyRouter()
    handler = ToolResultHandler(receiver, router)

    await handler.process_frontend_tool_bundle_result(
        bundle_id="bundle-shape",
        status="failure",
        step_results=[{"tool": "read_file", "status": "error", "output": "boom"}],
        screenshot=None,
        screenshot_ref="artifact-123",
        capture_meta={"source_w": 1920, "source_h": 1080},
        system_state={"active_window": "Browser", "mouse_position": "(10, 20)"},
        error="boom",
    )

    assert receiver.last_bundle == {
        "bundle_id": "bundle-shape",
        "status": "failure",
        "step_results": [{"tool": "read_file", "status": "error", "output": "boom"}],
        "screenshot": None,
        "screenshot_ref": "artifact-123",
        "capture_meta": {"source_w": 1920, "source_h": 1080},
        "system_state": {"active_window": "Browser", "mouse_position": "(10, 20)"},
        "error": "boom",
    }
    assert ("shared", "bundle-shape", "bundle") in router.calls
