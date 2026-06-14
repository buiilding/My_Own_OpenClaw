"""Covers resolved tool call storage behavior in the backend test suite."""

from backend.src.agent.tools.preparation.storage.resolved_call_storage import (
    ResolvedToolCallStorage,
)
from backend.src.agent.tools.preparation.types.resolved_tool_call import ResolvedToolCall
from backend.src.llm.parser_types import ParsedToolCall


def test_resolved_tool_call_storage_register_get_remove_clear():
    storage = ResolvedToolCallStorage()
    resolved = {"tool": "click", "x": 1, "y": 2}

    assert storage.get("req-1") is None

    storage.register("req-1", resolved)
    assert storage.get("req-1") == resolved

    storage.remove("req-1")
    assert storage.get("req-1") is None

    storage.register("req-2", {"tool": "type"})
    storage.register("req-3", {"tool": "scroll"})
    storage.clear()
    assert storage.get("req-2") is None
    assert storage.get("req-3") is None


def test_register_overwrites_existing_request_id():
    storage = ResolvedToolCallStorage()
    first = {"tool": "click", "x": 1, "y": 2}
    second = {"tool": "click", "x": 10, "y": 20}

    storage.register("req-1", first)
    storage.register("req-1", second)

    assert storage.get("req-1") == second


def test_remove_missing_request_id_is_noop():
    storage = ResolvedToolCallStorage()

    storage.register("req-1", {"tool": "type"})
    storage.remove("does-not-exist")

    assert storage.get("req-1") == {"tool": "type"}


def test_clear_is_idempotent():
    storage = ResolvedToolCallStorage()
    storage.register("req-1", {"tool": "scroll"})

    storage.clear()
    storage.clear()

    assert storage.get("req-1") is None


def test_storage_snapshots_mutable_dict_payloads():
    storage = ResolvedToolCallStorage()
    resolved = {"tool": "click", "args": {"x": 1, "y": 2}}

    storage.register("req-1", resolved)
    resolved["args"]["x"] = 99
    retrieved = storage.get("req-1")
    assert retrieved == {"tool": "click", "args": {"x": 1, "y": 2}}

    retrieved["args"]["y"] = 88
    assert storage.get("req-1") == {"tool": "click", "args": {"x": 1, "y": 2}}


def test_storage_snapshots_resolved_tool_call_dataclass_payloads():
    storage = ResolvedToolCallStorage()
    parsed_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"action": "click", "x": 1},
        metadata={"source": {"kind": "ocr"}},
    )
    resolved_call = ResolvedToolCall.from_parsed_call(parsed_call)
    resolved_call.parameters["x"] = 10

    storage.register("req-1", resolved_call)
    resolved_call.parameters["x"] = 99
    resolved_call.metadata["source"]["kind"] = "mutated"

    first_read = storage.get("req-1")
    assert first_read.parameters["x"] == 10
    assert first_read.metadata["source"]["kind"] == "ocr"

    first_read.parameters["x"] = 123
    first_read.metadata["source"]["kind"] = "read-mutated"

    second_read = storage.get("req-1")
    assert second_read.parameters["x"] == 10
    assert second_read.metadata["source"]["kind"] == "ocr"
