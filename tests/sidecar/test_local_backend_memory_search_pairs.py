import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from local_backend import LocalBackend  # noqa: E402


class _DummyTranscriptPairingStore:
    def __init__(self):
        self.search_calls = []
        self.conversation_calls = []

    async def search(self, query, user_id, filters, limit):
        self.search_calls.append((query, user_id, filters, limit))
        return [
            {
                "type": "episodic",
                "text": "Please draft a follow-up email",
                "record_kind": "transcript",
                "conversation_id": "conv-42",
                "role": "user",
                "message_index": 10,
            },
            {
                "type": "semantic",
                "text": "Prefers concise emails",
            },
        ]

    async def get_episodic_memories_by_conversation(
        self,
        user_id,
        conversation_id,
        limit,
        record_kind="transcript",
        after_message_index=None,
    ):
        self.conversation_calls.append(
            {
                "user_id": user_id,
                "conversation_id": conversation_id,
                "limit": limit,
                "record_kind": record_kind,
                "after_message_index": after_message_index,
            }
        )
        return [
            {
                "role": "assistant",
                "message_type": "tool-output",
                "message_index": 11,
                "content": "tool details that should be skipped",
            },
            {
                "role": "assistant",
                "message_type": "llm-text",
                "message_index": 12,
                "content": "Absolutely. Here is a concise follow-up draft.",
            },
        ]


@pytest.mark.asyncio
async def test_handle_search_memory_recovers_user_assistant_transcript_pairs():
    backend = LocalBackend()
    backend.memory_store = _DummyTranscriptPairingStore()

    result = await backend._handle_search_memory(
        "follow-up email",
        user_id="user-1",
        limit=5,
    )

    assert result["success"] is True
    assert result["data"]["memories"]["episodic"] == [
        "User: Please draft a follow-up email\nAssistant: Absolutely. Here is a concise follow-up draft."
    ]
    assert result["data"]["memories"]["semantic"] == ["Prefers concise emails"]
    assert backend.memory_store.conversation_calls == [
        {
            "user_id": "user-1",
            "conversation_id": "conv-42",
            "limit": 30,
            "record_kind": "transcript",
            "after_message_index": 10,
        }
    ]
