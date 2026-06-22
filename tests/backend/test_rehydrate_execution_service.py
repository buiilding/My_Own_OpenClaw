"""Covers rehydrate execution service behavior in the backend test suite."""

from types import SimpleNamespace

import pytest

from backend.src.api.schemas.incoming import RehydrateConversationMessage
from backend.src.api.services.rehydrate_entry_normalization import (
    RehydrateEntryNormalizer,
)
from backend.src.api.services.rehydrate_execution import RehydrateExecutionService
from backend.src.api.services.rehydrate_tool_linkage import RehydrateToolLinkageState


class _FakeSession:
    def __init__(self):
        self.calls = []
        self.model_history_calls = []
        self.history = SimpleNamespace(system_prompt=None)

    async def rehydrate_conversation(self, conversation_ref, entries):
        self.calls.append((conversation_ref, entries))

    async def install_model_history(
        self,
        *,
        conversation_ref,
        revision_id,
        entries,
        system_prompt=None,
    ):
        self.model_history_calls.append(
            {
                "conversation_ref": conversation_ref,
                "revision_id": revision_id,
                "entries": entries,
                "system_prompt": system_prompt,
            }
        )


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
    pending_tool_call_ids=None,
    image_data=None,
    transparency=None,
):
    state = RehydrateToolLinkageState(
        known_tool_call_ids=(
            known_tool_call_ids if known_tool_call_ids is not None else set()
        ),
        pending_tool_call_ids=(
            pending_tool_call_ids if pending_tool_call_ids is not None else []
        ),
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
                "message_type": "user_query",
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
                "message_type": "user_query",
            }
        ],
        workspace_path="/work/project-alpha",
        repo_instruction_messages=[
            {"role": "user", "content": "Respect AGENTS.md"},
        ],
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    assert manager.workspace_updates == [
        (
            "user-1",
            manager.session,
            "/work/project-alpha",
            [{"role": "user", "content": "Respect AGENTS.md"}],
        )
    ]


@pytest.mark.asyncio
async def test_execute_installs_model_history_checkpoint_without_transcript_rebuild():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    _TrackingArtifactStore.last_instance = None
    message = _build_message(
        [],
        model_history={
            "checkpoint_id": "mh-rev-1-turn-1",
            "revision_id": "rev-1",
            "created_at": "2026-06-22T12:00:00Z",
            "rows": [
                {
                    "id": "row-system",
                    "conversation_ref": "conv-1",
                    "revision_id": "rev-1",
                    "role": "system",
                    "message_type": "context_compaction",
                    "content": "system prompt",
                },
                {
                    "id": "row-tool",
                    "conversation_ref": "conv-1",
                    "revision_id": "rev-1",
                    "role": "tool",
                    "message_type": "tool_output",
                    "content": "bounded output",
                    "tool_call_id": "call-1",
                    "tool_name": "read_file",
                    "image_refs": ["artifact-1"],
                },
            ],
        },
    )

    await service.execute(message, "user-1", artifact_store_cls=_TrackingArtifactStore)

    assert manager.session.calls == []
    assert manager.session.model_history_calls == [
        {
            "conversation_ref": "conv-1",
            "revision_id": "rev-1",
            "system_prompt": "system prompt",
            "entries": [
                {
                    "id": "row-tool",
                    "conversation_ref": "conv-1",
                    "revision_id": "rev-1",
                    "role": "tool",
                    "message_type": "tool_output",
                    "content": "bounded output",
                    "tool_call_id": "call-1",
                    "tool_name": "read_file",
                    "image_refs": ["artifact-1"],
                },
            ],
        }
    ]
    assert _TrackingArtifactStore.last_instance is None


@pytest.mark.asyncio
async def test_execute_rejects_model_history_row_for_other_revision():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [],
        model_history={
            "checkpoint_id": "mh-rev-1-turn-1",
            "revision_id": "rev-1",
            "rows": [
                {
                    "id": "row-user",
                    "conversation_ref": "conv-1",
                    "revision_id": "rev-other",
                    "role": "user",
                    "message_type": "user_query",
                    "content": "hello",
                },
            ],
        },
    )

    with pytest.raises(ValueError, match="revision_id does not match"):
        await service.execute(
            message, "user-1", artifact_store_cls=_TrackingArtifactStore
        )

    assert manager.session.model_history_calls == []


@pytest.mark.asyncio
async def test_execute_raises_when_artifact_store_unavailable_for_screenshot_ref():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "user",
                "content": "hello",
                "message_type": "user_query",
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
                "message_type": "assistant_response",
                "screenshot_ref": "shot-missing",
            }
        ]
    )

    await service.execute(message, "user-1", artifact_store_cls=_LoadFailArtifactStore)

    _, entries = manager.session.calls[0]
    assert entries[0]["image_data"] is None


def test_normalize_rehydrated_tool_output_rejects_orphan_tool_output():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content="replace output",
        message_type="tool_output",
        tool_name="replace",
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    with pytest.raises(ValueError, match="without a matching tool call"):
        _normalize_entry(
            entry=entry,
            index=7,
            image_data=None,
            known_tool_call_ids=known_tool_call_ids,
            transparency=None,
        )

    assert known_tool_call_ids == set()


def test_normalize_rehydrated_entry_prefers_structured_payload_for_tool_call_rows():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content="not valid json",
        message_type="assistant_response",
        tool_name="ignored-fallback",
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
        structured_payload={
            "kind": "tool-call",
            "toolCalls": [
                {
                    "id": "call-structured-1",
                    "name": "open_url",
                    "arguments": {"url": "https://example.com"},
                    "thought_signature": "sig-structured-1",
                }
            ],
        },
    )

    pending_tool_call_ids = []
    entries = _normalize_entry(
        entry=entry,
        index=8,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=pending_tool_call_ids,
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
    assert normalized_entry["correlation_id"] is None
    assert pending_tool_call_ids == ["call-structured-1"]
    assert known_tool_call_ids == {"call-structured-1"}


def test_normalize_rehydrated_entry_ignores_singular_structured_tool_call_alias():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content="not valid json",
        message_type="assistant_response",
        tool_name=None,
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
            },
        },
    )

    entries = _normalize_entry(
        entry=entry,
        index=8,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=[],
        transparency=None,
    )

    assert entries == [
        {
            "role": "assistant",
            "content": "not valid json",
            "message_type": "assistant_response",
            "tool_name": None,
            "correlation_id": None,
            "timestamp": "2026-02-26T00:00:00Z",
            "image_data": None,
        }
    ]
    assert known_tool_call_ids == set()


def test_normalize_rehydrated_entry_sanitizes_internal_tool_bundle_call_trace():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content='{"bundle_id":"bundle-1","tools":[{"name":"mouse_control","arguments":{"x":1,"y":2}}]}',
        message_type="tool_output",
        tool_name="tool-bundle",
        correlation_id="bundle-1",
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries = _normalize_entry(
        entry=entry,
        index=11,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        transparency=None,
    )

    assert len(entries) == 1
    normalized_entry = entries[0]
    assert normalized_entry["role"] == "assistant"
    assert normalized_entry["message_type"] == "assistant_response"
    assert "tool_calls" not in normalized_entry
    assert known_tool_call_ids == set()


def test_normalize_rehydrated_entry_sanitizes_internal_bundled_output_trace():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content="bundled_tools output:\nstatus: failed",
        message_type="tool_output",
        tool_name="bundled_tools",
        correlation_id="bundle-1",
        tool_call_id=None,
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )

    entries = _normalize_entry(
        entry=entry,
        index=12,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        transparency=None,
    )

    assert len(entries) == 1
    normalized_entry = entries[0]
    assert normalized_entry["role"] == "assistant"
    assert normalized_entry["message_type"] == "assistant_response"
    assert "tool_calls" not in normalized_entry
    assert known_tool_call_ids == set()


def test_normalize_rehydrated_entry_sanitizes_bundled_tool_name_trace():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="tool",
        content="bundled_tools output:\nstatus: failed",
        message_type="tool_output",
        tool_name="bundled_tools",
        correlation_id="bundle-1",
        tool_call_id=None,
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )

    entries = _normalize_entry(
        entry=entry,
        index=13,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        transparency=None,
    )

    assert len(entries) == 1
    normalized_entry = entries[0]
    assert normalized_entry["role"] == "assistant"
    assert normalized_entry["message_type"] == "assistant_response"
    assert "tool_calls" not in normalized_entry
    assert known_tool_call_ids == set()


def test_normalize_rehydrated_entry_does_not_infer_bundle_trace_from_json_content():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content='{"bundle_id":"bundle-1","tools":[{"name":"mouse_control"}]}',
        message_type="assistant_response",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries = _normalize_entry(
        entry=entry,
        index=13,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        transparency=None,
    )

    assert entries == [
        {
            "role": "assistant",
            "content": '{"bundle_id":"bundle-1","tools":[{"name":"mouse_control"}]}',
            "message_type": "assistant_response",
            "tool_name": None,
            "correlation_id": None,
            "timestamp": "2026-02-26T00:00:00Z",
            "image_data": None,
        }
    ]
    assert known_tool_call_ids == set()


def test_normalize_rehydrated_entry_reuses_pending_tool_call_id_for_tool_output():
    known_tool_call_ids = set()

    assistant_entry = SimpleNamespace(
        role="assistant",
        content="",
        message_type="assistant_response",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=[
            {"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a.txt"}}
        ],
    )
    pending_tool_call_ids = []
    entries = _normalize_entry(
        entry=assistant_entry,
        index=0,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=pending_tool_call_ids,
        transparency=None,
    )
    assert entries[0]["tool_calls"][0]["id"] == "call-1"
    assert pending_tool_call_ids == ["call-1"]

    tool_output_entry = SimpleNamespace(
        role="tool",
        content="done",
        message_type="tool_output",
        tool_name="read_file",
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )
    entries = _normalize_entry(
        entry=tool_output_entry,
        index=1,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=pending_tool_call_ids,
        transparency=None,
    )
    assert len(entries) == 1
    assert entries[0]["role"] == "tool"
    assert entries[0]["tool_call_id"] == "call-1"
    assert pending_tool_call_ids == []


def test_normalize_rehydrated_entry_preserves_structured_assistant_text_content():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content=[
            {"type": "thinking", "text": "private reasoning"},
            {"type": "output_text", "text": "Visible answer."},
        ],
        message_type="assistant_response",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries = _normalize_entry(
        entry=entry,
        index=21,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        transparency=None,
    )

    assert entries == [
        {
            "role": "assistant",
            "content": "Visible answer.",
            "structured_content": [
                {"type": "output_text", "text": "Visible answer."},
            ],
            "message_type": "assistant_response",
            "tool_name": None,
            "correlation_id": None,
            "timestamp": "2026-02-26T00:00:00Z",
            "image_data": None,
        }
    ]


def test_normalize_rehydrated_entry_drops_assistant_rows_with_only_thinking_content():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content=[
            {"type": "thinking", "text": "private reasoning"},
        ],
        message_type="assistant_response",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    entries = _normalize_entry(
        entry=entry,
        index=22,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        transparency=None,
    )

    assert entries == []


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
        message_type="tool_output",
        tool_name="read_file",
        correlation_id=None,
        tool_call_id="call-1",
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )

    pending_tool_call_ids = ["call-1"]
    entries = _normalize_entry(
        entry=entry,
        index=23,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=pending_tool_call_ids,
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
            "message_type": "tool_output",
            "tool_name": "read_file",
            "correlation_id": None,
            "timestamp": "2026-02-26T00:00:01Z",
            "image_data": None,
            "tool_call_id": "call-1",
        }
    ]
    assert pending_tool_call_ids == []


def test_normalize_rehydrated_entry_consumes_matching_pending_tool_call_id():
    known_tool_call_ids = {"call-1", "call-2"}
    state = RehydrateToolLinkageState(
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=["call-1", "call-2"],
    )
    entry = SimpleNamespace(
        role="tool",
        content="done",
        message_type="tool_output",
        tool_name="replace",
        correlation_id=None,
        tool_call_id="call-2",
        timestamp="2026-02-26T00:00:01Z",
        tool_calls=None,
    )

    entries = RehydrateEntryNormalizer().normalize_entry(
        entry=entry,
        index=1,
        image_data=None,
        transparency=None,
        state=state,
    )

    assert len(entries) == 1
    assert entries[0]["tool_call_id"] == "call-2"
    assert state.pending_tool_call_ids == ["call-1"]


def test_normalize_rehydrated_tool_call_alias_rejects_even_with_explicit_id():
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

    with pytest.raises(ValueError, match="unsupported message_type='tool-call'"):
        _normalize_entry(
            entry=entry,
            index=2,
            image_data=None,
            known_tool_call_ids=known_tool_call_ids,
            pending_tool_call_ids=[],
            transparency=None,
        )

    assert known_tool_call_ids == set()


def test_normalize_rehydrated_tool_call_alias_rejects_missing_tool_call_id():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content='{"name":"read_file","args":{"path":"/tmp/a.txt"}}',
        message_type="tool-call",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=None,
    )

    with pytest.raises(ValueError, match="unsupported message_type='tool-call'"):
        _normalize_entry(
            entry=entry,
            index=3,
            image_data=None,
            known_tool_call_ids=known_tool_call_ids,
            pending_tool_call_ids=[],
            transparency=None,
        )

    assert known_tool_call_ids == set()


def test_linkage_state_rejects_pending_tool_calls():
    state = RehydrateToolLinkageState(
        known_tool_call_ids={"call-1", "call-2"},
        pending_tool_call_ids=["call-1", "call-2"],
    )

    with pytest.raises(ValueError, match="unanswered tool calls: call-1, call-2"):
        state.require_no_pending_tool_calls()

    assert state.pending_tool_call_ids == ["call-1", "call-2"]


@pytest.mark.asyncio
async def test_execute_restores_system_prompt_and_full_transparency_content():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "user",
                "content": "visible user text",
                "message_type": "user_query",
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
                "message_type": "assistant_response",
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


def test_normalize_rehydrated_tool_call_entry_preserves_thought_signature_from_structured_calls():
    known_tool_call_ids = set()
    entry = SimpleNamespace(
        role="assistant",
        content="",
        message_type="assistant_response",
        tool_name=None,
        correlation_id=None,
        tool_call_id=None,
        timestamp="2026-02-26T00:00:00Z",
        tool_calls=[
            {
                "id": "call-1",
                "name": "browser",
                "arguments": {"action": "snapshot"},
                "thought_signature": "sig-123",
            }
        ],
    )

    pending_tool_call_ids = []
    entries = _normalize_entry(
        entry=entry,
        index=3,
        image_data=None,
        known_tool_call_ids=known_tool_call_ids,
        pending_tool_call_ids=pending_tool_call_ids,
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
    assert pending_tool_call_ids == ["call-1"]
    assert known_tool_call_ids == {"call-1"}


@pytest.mark.asyncio
async def test_execute_rejects_unanswered_tool_call():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "assistant",
                "content": "",
                "message_type": "assistant_response",
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

    with pytest.raises(ValueError, match="unanswered tool calls: call-1"):
        await service.execute(
            message, "user-1", artifact_store_cls=_TrackingArtifactStore
        )

    assert manager.session.calls == []


@pytest.mark.asyncio
async def test_execute_rejects_multi_tool_turn_with_one_missing_output():
    manager = _FakeSessionManager()
    service = RehydrateExecutionService(manager)
    message = _build_message(
        [
            {
                "role": "assistant",
                "content": "",
                "message_type": "assistant_response",
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
                "message_type": "tool_output",
                "tool_call_id": "call-1",
            },
        ]
    )

    with pytest.raises(ValueError, match="unanswered tool calls: call-2"):
        await service.execute(
            message, "user-1", artifact_store_cls=_TrackingArtifactStore
        )

    assert manager.session.calls == []


def test_normalize_stored_message_type_emits_canonical_history_values():
    assert (
        RehydrateEntryNormalizer.normalize_stored_message_type(
            role="assistant",
            message_type=None,
        )
        == "assistant_response"
    )
    assert (
        RehydrateEntryNormalizer.normalize_stored_message_type(
            role="assistant",
            message_type="context_compaction",
        )
        == "context_compaction"
    )
    with pytest.raises(
        ValueError, match="unsupported message_type='assistant-message'"
    ):
        RehydrateEntryNormalizer.normalize_stored_message_type(
            role="assistant",
            message_type="assistant-message",
        )
    with pytest.raises(
        ValueError, match="unsupported message_type='context-compaction'"
    ):
        RehydrateEntryNormalizer.normalize_stored_message_type(
            role="assistant",
            message_type="context-compaction",
        )
