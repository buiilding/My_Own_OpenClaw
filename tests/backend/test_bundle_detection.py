from types import SimpleNamespace

from backend.src.agent.tools.shared.bundle_detection import (
    is_atomic_bundle,
    is_atomic_bundle_from_results,
)
from backend.src.llm.parser import ParsedResponse, ParsedToolCall


def _make_call(bundle_id=None, request_id=None):
    metadata = {}
    if bundle_id:
        metadata["bundle_id"] = bundle_id
    if request_id:
        metadata["request_id"] = request_id
    return ParsedToolCall(tool_name="read_file", parameters={}, raw_call="{}", metadata=metadata)


def test_is_atomic_bundle_requires_multiple_calls():
    response = ParsedResponse(
        original_response="{}",
        tool_calls=[_make_call(bundle_id="b1")],
        text_content="",
        has_tool_calls=True,
    )
    assert is_atomic_bundle(response) is False


def test_is_atomic_bundle_requires_bundle_id_and_no_request_id():
    calls = [_make_call(bundle_id="b1"), _make_call(bundle_id="b1")]
    response = ParsedResponse(
        original_response="{}",
        tool_calls=calls,
        text_content="",
        has_tool_calls=True,
    )
    assert is_atomic_bundle(response) is True

    calls_with_request = [_make_call(bundle_id="b1"), _make_call(bundle_id="b1", request_id="r1")]
    response = ParsedResponse(
        original_response="{}",
        tool_calls=calls_with_request,
        text_content="",
        has_tool_calls=True,
    )
    assert is_atomic_bundle(response) is False


def test_is_atomic_bundle_from_results():
    results = [
        SimpleNamespace(tool_call=_make_call(bundle_id="b1")),
        SimpleNamespace(tool_call=_make_call(bundle_id="b1")),
    ]
    assert is_atomic_bundle_from_results(results) is True

    results[1].tool_call.metadata["request_id"] = "r1"
    assert is_atomic_bundle_from_results(results) is False
