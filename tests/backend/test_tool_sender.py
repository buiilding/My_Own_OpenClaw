import pytest

from backend.src.agent.tools.preparation.preparer import PreparationResult
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.agent.tools.sending.sender import ToolSender
from backend.src.core.events.streaming_events import ToolBundleEvent, ToolCallEvent, ToolOutputEvent
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser_types import ParsedToolCall


class _DummyPreparer:
    def __init__(self, result: PreparationResult):
        self._result = result

    async def prepare(self, _tool_calls, _session) -> PreparationResult:
        return self._result


class _DummySyntheticResultFactory:
    @staticmethod
    def create(_tool_call: ParsedToolCall, error_msg: str) -> ToolResult:
        return ToolResult(success=False, error=error_msg, llm_content=error_msg)


class _DummySession:
    class _DummyResultStorage:
        def __init__(self):
            self.bundled_results = {}

        def store_bundled_result(self, bundle_id: str, result: ToolResult) -> None:
            self.bundled_results[bundle_id] = result

        def resolve_bundle_future(self, _bundle_id: str, _result: ToolResult) -> bool:
            return False

    def __init__(self):
        self.pending_results = {}
        self.result_storage = self._DummyResultStorage()

    def register_pending_tool_result(self, request_id: str, result: ToolResult) -> None:
        self.pending_results[request_id] = result

    def get_result_storage(self):
        return self.result_storage


def _build_sender(result: PreparationResult) -> ToolSender:
    return ToolSender(
        preparer=_DummyPreparer(result),
        synthetic_result_factory=_DummySyntheticResultFactory(),
    )


async def _collect_emitted_events(
    sender: ToolSender,
    tool_calls: list[ParsedToolCall],
    session: _DummySession,
):
    emitted = []
    async for event in sender.send_tools(tool_calls, session):
        emitted.append(event)
    return emitted


@pytest.mark.asyncio
async def test_send_tools_marks_failed_coordinate_resolution_as_non_executable():
    request_id = "req-123"
    failed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click"},
        metadata={
            "request_id": request_id,
            "description": "Chrome window is open",
            "explanation": "Clicking the target",
            "expectation": "Click should focus element",
        },
    )

    sender = _build_sender(
        PreparationResult(
            resolved_calls=[],
            errors=[(failed_call, "OCR could not find target text")],
            bundle_id=None,
        )
    )
    session = _DummySession()
    emitted = await _collect_emitted_events(sender, [failed_call], session)

    assert len(emitted) == 2
    assert isinstance(emitted[0], ToolCallEvent)
    assert emitted[0].metadata["coordinate_resolution_failed"] is True
    assert emitted[0].metadata["skip_frontend_execution"] is True
    assert emitted[0].metadata["request_id"] == request_id
    assert emitted[0].metadata["model_facing_tool_call"] == {
        "name": "mouse_control",
        "arguments": {"action": "click"},
    }

    assert isinstance(emitted[1], ToolOutputEvent)
    assert emitted[1].metadata["coordinate_resolution_failed"] is True
    assert emitted[1].metadata["skip_frontend_execution"] is True

    assert request_id in session.pending_results
    assert session.pending_results[request_id].error == "OCR could not find target text"


@pytest.mark.asyncio
async def test_send_tools_marks_invalid_direct_tool_preparation_failure_as_validation_error():
    request_id = "req-invalid-mouse-1"
    failed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"x": 10, "y": 20},
        metadata={
            "request_id": request_id,
            "model_facing_tool_call": {
                "id": "tool_llm_invalid_mouse_1",
                "name": "mouse_control",
                "arguments": {"x": 10, "y": 20},
            },
        },
    )

    sender = _build_sender(
        PreparationResult(
            resolved_calls=[],
            errors=[(
                failed_call,
                "mouse_control call is invalid and was rejected before frontend execution. Details: action: Field required.",
            )],
            bundle_id=None,
        )
    )
    session = _DummySession()
    emitted = await _collect_emitted_events(sender, [failed_call], session)

    assert len(emitted) == 2
    assert isinstance(emitted[0], ToolCallEvent)
    assert emitted[0].metadata["skip_frontend_execution"] is True
    assert emitted[0].metadata["llm_tool_call_validation_failed"] is True
    assert "coordinate_resolution_failed" not in emitted[0].metadata
    assert emitted[0].metadata["model_facing_tool_call"] == {
        "id": "tool_llm_invalid_mouse_1",
        "name": "mouse_control",
        "arguments": {"x": 10, "y": 20},
    }

    assert isinstance(emitted[1], ToolOutputEvent)
    assert emitted[1].metadata["skip_frontend_execution"] is True
    assert emitted[1].metadata["llm_tool_call_validation_failed"] is True
    assert "coordinate_resolution_failed" not in emitted[1].metadata

    assert request_id in session.pending_results
    assert "mouse_control call is invalid" in (session.pending_results[request_id].error or "")


@pytest.mark.asyncio
async def test_send_tools_marks_invalid_browser_preparation_failure_as_validation_error():
    request_id = "req-invalid-browser-1"
    failed_call = ParsedToolCall(
        tool_name="browser",
        parameters={},
        metadata={
            "request_id": request_id,
            "model_facing_tool_call": {
                "id": "tool_llm_invalid_browser_1",
                "name": "browser",
                "arguments": {},
            },
        },
    )

    sender = _build_sender(
        PreparationResult(
            resolved_calls=[],
            errors=[(
                failed_call,
                "browser call is invalid and was rejected before frontend execution. Details: action: Field required.",
            )],
            bundle_id=None,
        )
    )
    session = _DummySession()
    emitted = await _collect_emitted_events(sender, [failed_call], session)

    assert len(emitted) == 2
    assert isinstance(emitted[0], ToolCallEvent)
    assert emitted[0].metadata["skip_frontend_execution"] is True
    assert emitted[0].metadata["llm_tool_call_validation_failed"] is True
    assert "coordinate_resolution_failed" not in emitted[0].metadata
    assert emitted[0].metadata["model_facing_tool_call"] == {
        "id": "tool_llm_invalid_browser_1",
        "name": "browser",
        "arguments": {},
    }

    assert isinstance(emitted[1], ToolOutputEvent)
    assert emitted[1].metadata["skip_frontend_execution"] is True
    assert emitted[1].metadata["llm_tool_call_validation_failed"] is True
    assert "coordinate_resolution_failed" not in emitted[1].metadata

    assert request_id in session.pending_results
    assert "browser call is invalid" in (session.pending_results[request_id].error or "")


@pytest.mark.asyncio
async def test_send_tools_does_not_dispatch_bundle_when_preparation_fails():
    bundle_id = "bundle-123"
    first_call = ParsedToolCall(
        tool_name="keyboard_control",
        parameters={"action": "type", "text": "hello"},
        metadata={"bundle_id": bundle_id},
    )
    failed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "find_coordinates_by": "ocr", "ocr_text": "Add to cart"},
        metadata={"bundle_id": bundle_id},
    )
    resolved_first_call = ResolvedToolCall.from_parsed_call(first_call)

    sender = _build_sender(
        PreparationResult(
            resolved_calls=[resolved_first_call],
            errors=[
                (
                    failed_call,
                    "Identical instances found for OCR text 'Add to cart': Add to cart (150, 210).",
                )
            ],
            bundle_id=bundle_id,
        )
    )
    session = _DummySession()
    emitted = await _collect_emitted_events(sender, [first_call, failed_call], session)

    assert all(not isinstance(event, ToolBundleEvent) for event in emitted)
    assert all(not isinstance(event, ToolCallEvent) for event in emitted)
    assert bundle_id in session.result_storage.bundled_results
    bundle_result = session.result_storage.bundled_results[bundle_id]
    assert bundle_result.success is False
    assert "Identical instances found" in (bundle_result.error or "")
    assert isinstance(bundle_result.data, dict)
    assert bundle_result.data.get("status") == "failure"


@pytest.mark.asyncio
async def test_send_tools_includes_model_facing_tool_call_metadata():
    request_id = "req-789"
    parsed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Settings",
        },
        metadata={
            "request_id": request_id,
            "tool_call_id": "tool_llm_1",
        },
    )
    resolved_call = ResolvedToolCall.from_parsed_call(parsed_call)
    resolved_call.parameters = {
        "action": "click",
        "x": 122,
        "y": 418,
    }

    sender = _build_sender(
        PreparationResult(
            resolved_calls=[resolved_call],
            errors=[],
            bundle_id=None,
        )
    )
    session = _DummySession()
    emitted = await _collect_emitted_events(sender, [parsed_call], session)

    assert len(emitted) == 1
    assert isinstance(emitted[0], ToolCallEvent)
    assert emitted[0].parameters == {"action": "click", "x": 122, "y": 418}
    assert emitted[0].metadata is not None
    assert emitted[0].metadata["model_facing_tool_call"] == {
        "id": "tool_llm_1",
        "name": "mouse_control",
        "arguments": {
            "action": "click",
            "find_coordinates_by": "ocr",
            "ocr_text": "Settings",
        },
    }


@pytest.mark.asyncio
async def test_send_tools_bundle_includes_model_facing_tool_call_metadata() -> None:
    parsed_call = ParsedToolCall(
        tool_name="read_file",
        parameters={"file_path": "/tmp/a.txt"},
        metadata={
            "bundle_id": "bundle-1",
            "tool_call_id": "tool_llm_bundle_1",
        },
    )
    resolved_call = ResolvedToolCall.from_parsed_call(parsed_call)

    sender = _build_sender(
        PreparationResult(
            resolved_calls=[resolved_call],
            errors=[],
            bundle_id="bundle-1",
        )
    )
    session = _DummySession()
    emitted = await _collect_emitted_events(sender, [parsed_call], session)

    assert len(emitted) == 1
    assert isinstance(emitted[0], ToolBundleEvent)
    assert len(emitted[0].tools) == 1
    assert emitted[0].tools[0]["metadata"]["model_facing_tool_call"] == {
        "id": "tool_llm_bundle_1",
        "name": "read_file",
        "arguments": {"file_path": "/tmp/a.txt"},
    }


@pytest.mark.asyncio
async def test_send_tools_preserves_existing_model_facing_payload_for_successful_call():
    request_id = "req-direct-1"
    parsed_call = ParsedToolCall(
        tool_name="screenshot",
        parameters={},
        metadata={
            "request_id": request_id,
            "tool_call_id": "tool_llm_screenshot_1",
            "model_facing_tool_call": {
                "id": "tool_llm_screenshot_1",
                "name": "screenshot",
                "arguments": {},
            },
        },
    )
    resolved_call = ResolvedToolCall.from_parsed_call(parsed_call)

    sender = _build_sender(
        PreparationResult(
            resolved_calls=[resolved_call],
            errors=[],
            bundle_id=None,
        )
    )
    session = _DummySession()
    emitted = await _collect_emitted_events(sender, [parsed_call], session)

    assert len(emitted) == 1
    assert isinstance(emitted[0], ToolCallEvent)
    assert emitted[0].metadata["model_facing_tool_call"] == {
        "id": "tool_llm_screenshot_1",
        "name": "screenshot",
        "arguments": {},
    }
