from types import SimpleNamespace

import pytest

from backend.src.api.schema import RehydrateConversationMessage
from backend.src.api.services.rehydrate_execution import RehydrateExecutionService


class _FakeSession:
    def __init__(self):
        self.calls = []

    async def rehydrate_conversation(self, conversation_ref, entries):
        self.calls.append((conversation_ref, entries))


class _FakeSessionManager:
    def __init__(self):
        self.config = SimpleNamespace()
        self.session = _FakeSession()
        self.requested_users = []

    async def get_or_create_session(self, user_id):
        self.requested_users.append(user_id)
        return self.session


class _TrackingArtifactStore:
    last_instance = None

    def __init__(self):
        self.loaded_refs = []

    @classmethod
    def from_config(cls, _config):
        cls.last_instance = cls()
        return cls.last_instance

    def load_base64(self, artifact_id):
        self.loaded_refs.append(artifact_id)
        return f"resolved:{artifact_id}"


class _FailingArtifactStore:
    @classmethod
    def from_config(cls, _config):
        raise RuntimeError("artifact store unavailable")


class _LoadFailArtifactStore:
    @classmethod
    def from_config(cls, _config):
        return cls()

    def load_base64(self, _artifact_id):
        raise RuntimeError("missing artifact")


def _build_message(messages):
    return RehydrateConversationMessage(
        id="msg_rehydrate_test",
        type="rehydrate-conversation",
        user_id="user-1",
        payload={
            "conversation_ref": "conv-1",
            "messages": messages,
            "rehydrate_mode": "replace",
        },
    )


@pytest.mark.asyncio
async def test_execute_resolves_screenshot_ref_from_artifact_store():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "user",
                "content": "hello",
                "message_type": "user",
                "screenshot_ref": "shot-1",
            }
        ]
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    assert manager.requested_users == ["user-1"]
    conversation_ref, entries = manager.session.calls[0]
    assert conversation_ref == "conv-1"
    assert entries[0]["image_data"] == "resolved:shot-1"
    assert _TrackingArtifactStore.last_instance.loaded_refs == ["shot-1"]


@pytest.mark.asyncio
async def test_execute_prefers_inline_screenshot_over_artifact_ref():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "assistant",
                "content": "reply",
                "message_type": "assistant",
                "screenshot": "inline-b64",
                "screenshot_ref": "unused-ref",
            }
        ]
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    _, entries = manager.session.calls[0]
    assert entries[0]["image_data"] == "inline-b64"
    assert _TrackingArtifactStore.last_instance.loaded_refs == []


@pytest.mark.asyncio
async def test_execute_raises_when_artifact_store_unavailable_for_screenshot_ref():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "user",
                "content": "hello",
                "message_type": "user",
                "screenshot_ref": "shot-missing",
            }
        ]
    )

    with pytest.raises(ValueError, match="artifact store unavailable"):
        await service.execute(message, "user-1", artifact_store_cls=_FailingArtifactStore)


@pytest.mark.asyncio
async def test_execute_continues_when_artifact_ref_load_fails():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "assistant",
                "content": "with image ref",
                "message_type": "assistant",
                "screenshot_ref": "shot-missing",
            }
        ]
    )

    await service.execute(message, "user-1", artifact_store_cls=_LoadFailArtifactStore)

    _, entries = manager.session.calls[0]
    assert entries[0]["image_data"] is None


def test_normalize_rehydrated_tool_output_injects_synthetic_tool_call_entry():
    service = RehydrateExecutionService(_FakeSessionManager())
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content="replace output",
        message_type="tool-output",
        tool_name="replace",
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries, pending = service._normalize_rehydrated_entry(
        entry=entry,
        index=7,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
    )

    assert len(entries) == 2
    synthetic_call, tool_output = entries
    assert synthetic_call["role"] == "assistant"
    assert synthetic_call["tool_calls"][0]["id"] == "rehydrate_tool_call_7"
    assert synthetic_call["tool_calls"][0]["name"] == "replace"
    assert tool_output["role"] == "tool"
    assert tool_output["tool_call_id"] == "rehydrate_tool_call_7"
    assert pending is None
    assert known_tool_call_ids == {"rehydrate_tool_call_7"}


def test_normalize_tool_calls_parses_function_payload_and_skips_invalid_entries():
    normalized = RehydrateExecutionService._normalize_tool_calls(
        [
            {
                "id": " call-1 ",
                "type": "function",
                "function": {
                    "name": "read_file",
                    "arguments": '{"path":"/tmp/a.txt"}',
                },
            },
            {"id": "call-2", "name": "replace", "arguments": {"path": "/tmp/b.txt"}},
            {"id": "", "name": "invalid"},
            "not-a-dict",
        ]
    )

    assert normalized == [
        {"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a.txt"}},
        {"id": "call-2", "name": "replace", "arguments": {"path": "/tmp/b.txt"}},
    ]


def test_normalize_rehydrated_entry_reuses_pending_tool_call_id_for_tool_output():
    service = RehydrateExecutionService(_FakeSessionManager())
    known_tool_call_ids = set()

    assistant_entry = SimpleNamespace(
        role="assistant",
        content="",
        message_type="assistant-message",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=[{"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a.txt"}}],
    )
    entries, pending = service._normalize_rehydrated_entry(
        entry=assistant_entry,
        index=0,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
    )
    assert entries[0]["tool_calls"][0]["id"] == "call-1"
    assert pending == "call-1"

    tool_output_entry = SimpleNamespace(
        role="tool",
        content="done",
        message_type="tool-output",
        tool_name="read_file",
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )
    entries, pending = service._normalize_rehydrated_entry(
        entry=tool_output_entry,
        index=1,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=pending,
    )
    assert len(entries) == 1
    assert entries[0]["role"] == "tool"
    assert entries[0]["tool_call_id"] == "call-1"
    assert pending is None


def test_extract_tool_call_details_reads_arguments_alias_field():
    service = RehydrateExecutionService(_FakeSessionManager())
    tool_name, arguments = service._extract_tool_call_details(
        content='{"name":"replace","arguments":{"path":"/tmp/a.txt"}}',
        fallback_tool_name="fallback_tool",
    )

    assert tool_name == "replace"
    assert arguments == {"path": "/tmp/a.txt"}


def test_extract_tool_call_details_falls_back_for_invalid_payload_shapes():
    service = RehydrateExecutionService(_FakeSessionManager())

    tool_name, arguments = service._extract_tool_call_details(
        content='["not", "a", "dict"]',
        fallback_tool_name="fallback_tool",
    )
    assert tool_name == "fallback_tool"
    assert arguments == {}

    tool_name, arguments = service._extract_tool_call_details(
        content="not-json",
        fallback_tool_name=None,
    )
    assert tool_name == "unknown_tool"
    assert arguments == {}


def test_normalize_tool_calls_falls_back_for_missing_name_and_bad_json_arguments():
    normalized = RehydrateExecutionService._normalize_tool_calls(
        [
            {
                "id": "call-1",
                "type": "function",
                "function": {
                    "name": "  ",
                    "arguments": "{bad-json",
                },
            }
        ]
    )

    assert normalized == [{"id": "call-1", "name": "unknown_tool_0", "arguments": {}}]


def test_normalize_rehydrated_tool_call_entry_uses_explicit_tool_call_id():
    service = RehydrateExecutionService(_FakeSessionManager())
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content='{"name":"read_file","args":{"path":"/tmp/a.txt"}}',
        message_type="tool-call",
        tool_name=None,
        correlation_id="corr-1",
        tool_call_id="call-explicit",
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries, pending = service._normalize_rehydrated_entry(
        entry=entry,
        index=2,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
    )

    assert len(entries) == 1
    call_entry = entries[0]
    assert call_entry["role"] == "assistant"
    assert call_entry["correlation_id"] == "call-explicit"
    assert call_entry["tool_calls"][0] == {
        "id": "call-explicit",
        "name": "read_file",
        "arguments": {"path": "/tmp/a.txt"},
    }
    assert pending == "call-explicit"
    assert known_tool_call_ids == {"call-explicit"}


def test_normalize_stored_message_type_collapses_context_summary_variants():
    assert RehydrateExecutionService._normalize_stored_message_type("context_summary") == "context-compaction"
    assert RehydrateExecutionService._normalize_stored_message_type("context-compaction") == "context-compaction"
    assert RehydrateExecutionService._normalize_stored_message_type("assistant-message") == "assistant-message"
