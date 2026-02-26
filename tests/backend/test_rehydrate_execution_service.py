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


def test_normalize_stored_message_type_collapses_context_summary_variants():
    assert RehydrateExecutionService._normalize_stored_message_type("context_summary") == "context-compaction"
    assert RehydrateExecutionService._normalize_stored_message_type("context-compaction") == "context-compaction"
    assert RehydrateExecutionService._normalize_stored_message_type("assistant-message") == "assistant-message"
