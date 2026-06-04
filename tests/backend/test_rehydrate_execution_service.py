from types import SimpleNamespace

import pytest

from backend.src.api.schemas import RehydrateConversationMessage
from backend.src.api.services.rehydrate_entry_normalization import (
    RehydrateEntryNormalizer,
    RehydrateNormalizationState,
)
from backend.src.api.services.rehydrate_execution import RehydrateExecutionService
from backend.src.api.services.rehydrate_tool_call_normalization import (
    extract_tool_call_details,
    normalize_tool_calls,
)


class _FakeSession:
    def __init__(self):
        self.calls = []
        self.history = SimpleNamespace(system_prompt=None)

    async def rehydrate_conversation(self, conversation_ref, entries):
        self.calls.append((conversation_ref, entries))


class _FakeSessionManager:
    def __init__(self):
        self.config = SimpleNamespace()
        self.session = _FakeSession()
        self.requested_users = []
        self.workspace_updates = []

    async def get_or_create_session(self, user_id, conversation_ref=None):
        self.requested_users.append((user_id, conversation_ref))
        return self.session

    def set_session_workspace_path(
        self,
        user_id,
        session,
        workspace_path,
        repo_instruction_messages=None,
    ):
        self.workspace_updates.append(
            (user_id, session, workspace_path, repo_instruction_messages)
        )


class _TrackingArtifactStore:
    last_instance = None

    def __init__(self):
        self.loaded_refs = []

    @classmethod
    def from_config(cls, _config):
        cls.last_instance = cls()
        return cls.last_instance

    def load_base64(self, artifact_id, owner_user_id=None):
        self.loaded_refs.append(artifact_id)
        self.owner_user_id = owner_user_id
        return f"resolved:{artifact_id}"


class _FailingArtifactStore:
    @classmethod
    def from_config(cls, _config):
        raise RuntimeError("artifact store unavailable")


class _LoadFailArtifactStore:
    @classmethod
    def from_config(cls, _config):
        return cls()

    def load_base64(self, _artifact_id, owner_user_id=None):
        raise RuntimeError("missing artifact")


def _build_message(messages, **payload_overrides):
    return RehydrateConversationMessage(
        id="msg_rehydrate_test",
        type="rehydrate-conversation",
        user_id="user-1",
        payload={
            "conversation_ref": "conv-1",
            "messages": messages,
            "rehydrate_mode": "replace",
            **payload_overrides,
        },
    )


def _normalize_entry(
    entry,
    *,
    index,
    known_tool_call_ids=None,
    pending_tool_call_id=None,
    image_data=None,
    transparency=None,
):
    state = RehydrateNormalizationState(
        known_tool_call_ids=(
            known_tool_call_ids if known_tool_call_ids is not None else set()
        ),
        pending_tool_call_ids=[pending_tool_call_id] if pending_tool_call_id else [],
    )
    return RehydrateEntryNormalizer().normalize_entry(
        entry=entry,
        index=index,
        image_data=image_data,
        transparency=transparency,
        state=state,
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

    assert manager.requested_users == [("user-1", "conv-1")]
    conversation_ref, entries = manager.session.calls[0]
    assert conversation_ref == "conv-1"
    assert entries[0]["image_data"] == "resolved:shot-1"
    assert _TrackingArtifactStore.last_instance.loaded_refs == ["shot-1"]
    assert _TrackingArtifactStore.last_instance.owner_user_id == "user-1"


@pytest.mark.asyncio
async def test_execute_forwards_workspace_repo_instructions_to_session_manager():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "user",
                "content": "hello",
                "message_type": "user",
            }
        ],
        workspace_path="/work/WindieOS",
        repo_instruction_messages=[
            {"role": "user", "content": "Respect AGENTS.md"},
        ],
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    assert manager.workspace_updates == [
        (
            "user-1",
            manager.session,
            "/work/WindieOS",
            [{"role": "user", "content": "Respect AGENTS.md"}],
        )
    ]


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
        await service.execute(
            message, "user-1", artifact_store_cls=_FailingArtifactStore
        )


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

    entries, pending = _normalize_entry(
        entry=entry,
        index=7,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
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


def test_normalize_rehydrated_entry_prefers_structured_payload_for_tool_call_rows():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content="not valid json",
        message_type="tool-call",
        tool_name="ignored-fallback",
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
        structured_payload={
            "kind": "tool-call",
            "toolCall": {
                "id": "call-structured-1",
                "name": "open_url",
                "arguments": {"url": "https://example.com"},
                "thought_signature": "sig-structured-1",
            },
        },
    )

    entries, pending = _normalize_entry(
        entry=entry,
        index=8,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
    )

    assert len(entries) == 1
    normalized_entry = entries[0]
    assert normalized_entry["role"] == "assistant"
    assert normalized_entry["tool_calls"] == [
        {
            "id": "call-structured-1",
            "name": "open_url",
            "arguments": {"url": "https://example.com"},
            "thought_signature": "sig-structured-1",
        }
    ]
    assert normalized_entry["correlation_id"] == "call-structured-1"
    assert pending == "call-structured-1"
    assert known_tool_call_ids == {"call-structured-1"}


def test_normalize_rehydrated_entry_sanitizes_internal_tool_bundle_call_trace():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content='{"bundle_id":"bundle-1","tools":[{"name":"mouse_control","arguments":{"x":1,"y":2}}]}',
        message_type="tool-bundle",
        tool_name="tool-bundle",
        correlation_id="bundle-1",
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries, pending = _normalize_entry(
        entry=entry,
        index=11,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
    )

    assert len(entries) == 1
    normalized_entry = entries[0]
    assert normalized_entry["role"] == "assistant"
    assert normalized_entry["message_type"] == "llm-text"
    assert "tool_calls" not in normalized_entry
    assert pending is None
    assert known_tool_call_ids == set()


def test_normalize_rehydrated_entry_sanitizes_internal_bundled_output_trace():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content="bundled_tools output:\nstatus: failed",
        message_type="tool-output",
        tool_name="bundled_tools",
        correlation_id="bundle-1",
        tool_call_id=None,
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )

    entries, pending = _normalize_entry(
        entry=entry,
        index=12,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
    )

    assert len(entries) == 1
    normalized_entry = entries[0]
    assert normalized_entry["role"] == "assistant"
    assert normalized_entry["message_type"] == "llm-text"
    assert "tool_calls" not in normalized_entry
    assert pending is None
    assert known_tool_call_ids == set()


def test_normalize_tool_calls_parses_function_payload_and_skips_invalid_entries():
    normalized = normalize_tool_calls(
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
    known_tool_call_ids = set()

    assistant_entry = SimpleNamespace(
        role="assistant",
        content="",
        message_type="assistant-message",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=[
            {"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a.txt"}}
        ],
    )
    entries, pending = _normalize_entry(
        entry=assistant_entry,
        index=0,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
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
    entries, pending = _normalize_entry(
        entry=tool_output_entry,
        index=1,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=pending,
        transparency=None,
    )
    assert len(entries) == 1
    assert entries[0]["role"] == "tool"
    assert entries[0]["tool_call_id"] == "call-1"
    assert pending is None


def test_normalize_rehydrated_entry_preserves_structured_assistant_text_content():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content=[
            {"type": "thinking", "text": "private reasoning"},
            {"type": "output_text", "text": "Visible answer."},
        ],
        message_type="assistant-message",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries, pending = _normalize_entry(
        entry=entry,
        index=21,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
    )

    assert entries == [
        {
            "role": "assistant",
            "content": "Visible answer.",
            "structured_content": [
                {"type": "output_text", "text": "Visible answer."},
            ],
            "message_type": "assistant-message",
            "tool_name": None,
            "correlation_id": None,
            "timestamp": "2026-02-26T00:00:00Z",
            "image_data": None,
        }
    ]
    assert pending is None


def test_normalize_rehydrated_entry_drops_assistant_rows_with_only_thinking_content():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content=[
            {"type": "thinking", "text": "private reasoning"},
        ],
        message_type="assistant-message",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries, pending = _normalize_entry(
        entry=entry,
        index=22,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
    )

    assert entries == []
    assert pending is None


def test_normalize_rehydrated_entry_preserves_structured_tool_content():
    known_tool_call_ids = {"call-1"}
    entry = SimpleNamespace(
        role="tool",
        content=[
            {"type": "output_text", "text": "done"},
            {
                "type": "image_url",
                "image_url": {"url": "data:image/png;base64,abc123"},
            },
        ],
        message_type="tool-output",
        tool_name="read_file",
        correlation_id=None,
        tool_call_id="call-1",
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )

    entries, pending = _normalize_entry(
        entry=entry,
        index=23,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id="call-1",
        transparency=None,
    )

    assert entries == [
        {
            "role": "tool",
            "content": [
                {"type": "output_text", "text": "done"},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,abc123"},
                },
            ],
            "message_type": "tool-output",
            "tool_name": "read_file",
            "correlation_id": None,
            "timestamp": "2026-02-26T00:00:01Z",
            "image_data": None,
            "tool_call_id": "call-1",
        }
    ]
    assert pending is None


def test_normalize_rehydrated_entry_consumes_matching_pending_tool_call_id():
    known_tool_call_ids = {"call-1", "call-2"}
    state = RehydrateNormalizationState(
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=["call-1", "call-2"],
    )
    entry = SimpleNamespace(
        role="tool",
        content="done",
        message_type="tool-output",
        tool_name="replace",
        correlation_id=None,
        tool_call_id="call-2",
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )

    entries, pending = RehydrateEntryNormalizer().normalize_entry(
        entry=entry,
        index=1,
        image_data=None,
        transparency=None,
        state=state,
    )

    assert len(entries) == 1
    assert entries[0]["tool_call_id"] == "call-2"
    assert pending is None
    assert state.pending_tool_call_ids == ["call-1"]


def test_extract_tool_call_details_reads_arguments_alias_field():
    tool_name, arguments, tool_call_id, thought_signature = extract_tool_call_details(
        content='{"name":"replace","arguments":{"path":"/tmp/a.txt"}}',
        fallback_tool_name="fallback_tool",
    )

    assert tool_name == "replace"
    assert arguments == {"path": "/tmp/a.txt"}
    assert tool_call_id is None
    assert thought_signature is None


def test_extract_tool_call_details_falls_back_for_invalid_payload_shapes():
    tool_name, arguments, tool_call_id, thought_signature = extract_tool_call_details(
        content='["not", "a", "dict"]',
        fallback_tool_name="fallback_tool",
    )
    assert tool_name == "fallback_tool"
    assert arguments == {}
    assert tool_call_id is None
    assert thought_signature is None

    tool_name, arguments, tool_call_id, thought_signature = extract_tool_call_details(
        content="not-json",
        fallback_tool_name=None,
    )
    assert tool_name == "unknown_tool"
    assert arguments == {}
    assert tool_call_id is None
    assert thought_signature is None


def test_normalize_tool_calls_falls_back_for_missing_name_and_bad_json_arguments():
    normalized = normalize_tool_calls(
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


def test_normalize_tool_calls_preserves_thought_signature():
    normalized = normalize_tool_calls(
        [
            {
                "id": "call-1",
                "type": "function",
                "function": {
                    "name": "browser",
                    "arguments": '{"action":"snapshot"}',
                    "thoughtSignature": "sig-123",
                },
            }
        ]
    )

    assert normalized == [
        {
            "id": "call-1",
            "name": "browser",
            "arguments": {"action": "snapshot"},
            "thought_signature": "sig-123",
        }
    ]


def test_normalize_rehydrated_tool_call_entry_uses_explicit_tool_call_id():
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

    entries, pending = _normalize_entry(
        entry=entry,
        index=2,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
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


def test_finalize_pending_tool_call_entries_synthesizes_missing_tool_outputs():
    state = RehydrateNormalizationState(
        known_tool_call_ids={"call-1", "call-2"},
        pending_tool_call_ids=["call-1", "call-2"],
    )

    repaired_entries = RehydrateEntryNormalizer.finalize_pending_tool_call_entries(
        state=state,
        timestamp="2026-02-26T00:00:05Z",
    )

    assert [entry["tool_call_id"] for entry in repaired_entries] == ["call-1", "call-2"]
    assert all(entry["role"] == "tool" for entry in repaired_entries)
    assert all(entry["message_type"] == "tool-output" for entry in repaired_entries)
    assert state.pending_tool_call_ids == []


@pytest.mark.asyncio
async def test_execute_restores_system_prompt_and_full_transparency_content():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "user",
                "content": "visible user text",
                "message_type": "user",
                "transparency": {
                    "systemPrompt": "System prompt from transcript",
                    "fullUserMessage": {
                        "content": "<full_user>payload</full_user>",
                    },
                },
            },
            {
                "role": "assistant",
                "content": "visible assistant text",
                "message_type": "llm-text",
                "transparency": {
                    "fullAssistantMessage": {
                        "content": "<full_assistant>payload</full_assistant>",
                    },
                },
            },
        ]
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    _, entries = manager.session.calls[0]
    assert entries[0]["content"] == "<full_user>payload</full_user>"
    assert entries[1]["content"] == "<full_assistant>payload</full_assistant>"
    assert manager.session.history.system_prompt == "System prompt from transcript"


def test_normalize_rehydrated_tool_call_entry_preserves_thought_signature_from_content():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content='{"id":"call-1","name":"browser","arguments":{"action":"snapshot"},"thought_signature":"sig-123"}',
        message_type="tool-call",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries, pending = _normalize_entry(
        entry=entry,
        index=3,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_id=None,
        transparency=None,
    )

    assert len(entries) == 1
    call_entry = entries[0]
    assert call_entry["tool_calls"][0] == {
        "id": "call-1",
        "name": "browser",
        "arguments": {"action": "snapshot"},
        "thought_signature": "sig-123",
    }
    assert pending == "call-1"
    assert known_tool_call_ids == {"call-1"}


@pytest.mark.asyncio
async def test_execute_appends_synthetic_tool_output_for_unanswered_tool_call():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "assistant",
                "content": "",
                "message_type": "assistant-message",
                "tool_calls": [
                    {
                        "id": "call-1",
                        "name": "run_shell_command",
                        "arguments": {"command": "pwd"},
                    }
                ],
            }
        ]
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    _, entries = manager.session.calls[0]
    assert [entry["role"] for entry in entries] == ["assistant", "tool"]
    assert entries[0]["tool_calls"][0]["id"] == "call-1"
    assert entries[1]["tool_call_id"] == "call-1"
    assert "missing during rehydrate" in entries[1]["content"]


@pytest.mark.asyncio
async def test_execute_repairs_multi_tool_turn_with_one_missing_output():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "assistant",
                "content": "",
                "message_type": "assistant-message",
                "tool_calls": [
                    {
                        "id": "call-1",
                        "name": "run_shell_command",
                        "arguments": {"command": "pwd"},
                    },
                    {
                        "id": "call-2",
                        "name": "read_file",
                        "arguments": {"file_path": "/tmp/a.txt"},
                    },
                ],
            },
            {
                "role": "tool",
                "content": "pwd output",
                "message_type": "tool-output",
                "tool_call_id": "call-1",
            },
        ]
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    _, entries = manager.session.calls[0]
    assert [entry["role"] for entry in entries] == ["assistant", "tool", "tool"]
    assert entries[1]["tool_call_id"] == "call-1"
    assert entries[2]["tool_call_id"] == "call-2"
    assert "missing during rehydrate" in entries[2]["content"]


def test_normalize_stored_message_type_collapses_context_summary_variants():
    assert (
        RehydrateEntryNormalizer.normalize_stored_message_type("context_summary")
        == "context-compaction"
    )
    assert (
        RehydrateEntryNormalizer.normalize_stored_message_type("context-compaction")
        == "context-compaction"
    )
    assert (
        RehydrateEntryNormalizer.normalize_stored_message_type("assistant-message")
        == "assistant-message"
    )
