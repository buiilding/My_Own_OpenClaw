"""Covers conversation history behavior in the backend test suite."""

import base64

import pytest

import backend.src.services.token_service as token_service
from backend.src.agent.session.state import ConversationHistory
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.llm.providers.base import LLMProvider

PNG_BASE64 = base64.b64encode(b"\x89PNG\r\n\x1a\npng-bytes").decode("ascii")


def test_get_history_includes_system_prompt_and_messages():
    history = ConversationHistory(system_prompt="system prompt")

    history.add_user_message("hello")

    messages = history.get_history()
    assert messages[0] == {"role": "system", "content": "system prompt"}
    assert messages[1]["role"] == "user"
    assert messages[1]["content"] == "hello"


def test_history_retains_messages_without_count_pruning():
    history = ConversationHistory()

    history.add_user_message("first")
    history.add_assistant_message("second")
    history.add_user_message("third")

    stored = history.get_stored_messages()
    assert len(stored) == 3
    assert stored[0].content == "first"
    assert stored[1].content == "second"
    assert stored[2].content == "third"


def test_preserves_all_images_in_history():
    history = ConversationHistory()

    history.add_user_message("one", image_data=PNG_BASE64)
    history.add_tool_output("two", image_data=PNG_BASE64)
    history.add_user_message("three", image_data=PNG_BASE64)

    stored = history.get_stored_messages()
    assert stored[0].image_data == PNG_BASE64
    assert stored[1].image_data == PNG_BASE64
    assert stored[2].image_data == PNG_BASE64
    assert stored[0].structured_content == [
        {"type": "text", "text": "one"},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{PNG_BASE64}"},
        },
    ]
    assert stored[1].structured_content == [
        {"type": "text", "text": "two"},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{PNG_BASE64}"},
        },
    ]
    assert stored[2].structured_content == [
        {"type": "text", "text": "three"},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{PNG_BASE64}"},
        },
    ]

    llm_messages = history.get_history()
    assert isinstance(llm_messages[0]["content"], list)
    assert isinstance(llm_messages[1]["content"], list)
    assert isinstance(llm_messages[2]["content"], list)


def test_tool_output_history_preserves_jpeg_data_url_for_llm():
    history = ConversationHistory()
    history.stage_tool_call_ids(["call-shot"])

    history.add_tool_output(
        "Screenshot captured successfully.",
        image_data="data:image/jpeg;base64,jpeg-b64",
        tool_name="screenshot",
    )

    llm_messages = history.get_history()
    assert llm_messages == [
        {
            "role": "tool",
            "content": [
                {"type": "text", "text": "Screenshot captured successfully."},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/jpeg;base64,jpeg-b64"},
                },
            ],
            "tool_call_id": "call-shot",
            "name": "screenshot",
        }
    ]


def test_get_history_mutable_isolated_from_internal_cache():
    history = ConversationHistory()
    history.add_user_message("alpha")

    mutable = history.get_history_mutable()
    mutable[0]["content"] = "mutated"

    original = history.get_history()
    assert original[0]["content"] == "alpha"


def test_get_token_count_caches_per_model(monkeypatch):
    history = ConversationHistory()
    history.add_user_message("alpha")

    class FakeTokenService:
        def __init__(self) -> None:
            self.calls = []

        def count_tokens(self, messages, model):
            self.calls.append(model)
            return 5

    service = FakeTokenService()
    monkeypatch.setattr(token_service, "get_token_service", lambda: service)

    assert history.get_token_count("model-a") == 5
    assert history.get_token_count("model-a") == 5
    assert service.calls == ["model-a"]

    assert history.get_token_count("model-b") == 5
    assert service.calls == ["model-a", "model-b"]


def test_add_tool_output_updates_cached_token_count(monkeypatch):
    history = ConversationHistory()
    history.add_user_message("alpha")

    class FakeTokenService:
        def __init__(self) -> None:
            self.count_tokens_calls = 0
            self.count_message_tokens_calls = 0

        def count_tokens(self, messages, model):
            self.count_tokens_calls += 1
            return 10

        def count_message_tokens(self, message, model):
            self.count_message_tokens_calls += 1
            return 3

    service = FakeTokenService()
    monkeypatch.setattr(token_service, "get_token_service", lambda: service)

    assert history.get_token_count("model-a") == 10
    assert service.count_tokens_calls == 1
    assert service.count_message_tokens_calls == 0

    history.add_tool_output("tool output")

    assert history.get_token_count("model-a") == 13
    assert service.count_tokens_calls == 1
    assert service.count_message_tokens_calls == 1


def test_tool_output_with_staged_tool_call_id_avoids_duplicate_text_rows():
    history = ConversationHistory()

    history.stage_tool_call_ids(["call_1"])
    history.add_tool_output(
        "tool output",
        tool_name="browser",
        compaction_facts={"action": "click", "ref": 42293},
    )

    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].role == MessageRole.TOOL
    assert stored[0].content == "tool output"
    assert stored[0].tool_call_id == "call_1"
    assert stored[0].tool_name == "browser"
    assert stored[0].compaction_facts == {"action": "click", "ref": 42293}

    llm_messages = history.get_history()
    assert len(llm_messages) == 1
    assert llm_messages[0]["role"] == "tool"
    assert llm_messages[0]["content"] == "tool output"


def test_tool_output_with_staged_tool_call_id_preserves_image_context_without_text_duplication():
    history = ConversationHistory()

    history.stage_tool_call_ids(["call_1"])
    history.add_tool_output("tool output", image_data=PNG_BASE64)

    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].role == MessageRole.TOOL
    assert stored[0].content == "tool output"
    assert stored[0].tool_call_id == "call_1"
    assert stored[0].image_data == PNG_BASE64
    assert stored[0].structured_content == [
        {"type": "text", "text": "tool output"},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{PNG_BASE64}"},
        },
    ]

    llm_messages = history.get_history()
    assert len(llm_messages) == 1
    assert llm_messages[0]["role"] == "tool"
    assert isinstance(llm_messages[0]["content"], list)
    assert llm_messages[0]["content"][0]["type"] == "text"
    assert llm_messages[0]["content"][0]["text"] == "tool output"
    assert llm_messages[0]["content"][1]["image_url"]["url"].startswith(
        "data:image/png;base64,"
    )

    assert llm_messages[0]["tool_call_id"] == "call_1"


def test_add_tool_output_with_staged_tool_and_image_updates_cached_token_count_per_row(
    monkeypatch,
):
    history = ConversationHistory()
    history.add_user_message("alpha")

    class FakeTokenService:
        def __init__(self) -> None:
            self.count_tokens_calls = 0
            self.count_message_tokens_calls = 0

        def count_tokens(self, messages, model):
            self.count_tokens_calls += 1
            return 10

        def count_message_tokens(self, message, model):
            self.count_message_tokens_calls += 1
            return 2

    service = FakeTokenService()
    monkeypatch.setattr(token_service, "get_token_service", lambda: service)

    assert history.get_token_count("model-a") == 10
    assert service.count_tokens_calls == 1

    history.stage_tool_call_ids(["call_1"])
    history.add_tool_output("tool output", image_data="img-1")

    assert history.get_token_count("model-a") == 12
    assert service.count_tokens_calls == 1
    assert service.count_message_tokens_calls == 1


def test_finalize_pending_tool_calls_as_cancelled_adds_tool_rows_and_clears_staging():
    history = ConversationHistory()

    history.stage_tool_call_ids(["call_1", "call_2"], consume_all_on_next_output=True)
    reconciled = history.finalize_pending_tool_calls_as_cancelled(
        message="Cancelled by user",
    )

    assert reconciled == 2

    stored = history.get_stored_messages()
    assert len(stored) == 2
    assert stored[0].role == MessageRole.TOOL
    assert stored[0].tool_call_id == "call_1"
    assert stored[0].content == "Cancelled by user"
    assert stored[1].role == MessageRole.TOOL
    assert stored[1].tool_call_id == "call_2"
    assert stored[1].content == "Cancelled by user"

    # Staging must be cleared: next tool output should not link to previous tool_call ids.
    history.add_tool_output("next tool output")
    final_stored = history.get_stored_messages()
    assert final_stored[-1].role == MessageRole.USER
    assert final_stored[-1].tool_call_id is None


def test_tool_output_incrementally_updates_token_cache(monkeypatch):
    history = ConversationHistory()
    history.add_user_message("alpha")

    class FakeTokenService:
        def __init__(self) -> None:
            self.count_tokens_calls = 0

        def count_tokens(self, messages, model):
            self.count_tokens_calls += 1
            return 7

        def count_message_tokens(self, message, model):
            return 2

    service = FakeTokenService()
    monkeypatch.setattr(token_service, "get_token_service", lambda: service)

    assert history.get_token_count("model-a") == 7
    assert service.count_tokens_calls == 1

    history.add_tool_output("tool output")
    assert history.get_token_count("model-a") == 9
    assert service.count_tokens_calls == 1


def test_add_assistant_message_drops_thinking_only_structured_content():
    history = ConversationHistory()

    history.add_assistant_message(
        [
            {"type": "thinking", "text": "private reasoning"},
        ]
    )

    assert history.get_stored_messages() == []


def test_add_assistant_message_preserves_replay_safe_structured_content():
    history = ConversationHistory()

    history.add_assistant_message(
        [
            {"type": "thinking", "text": "private reasoning"},
            {"type": "output_text", "text": "Visible answer."},
            {"type": "refusal", "refusal": "Cannot share that."},
        ]
    )

    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].content == "Visible answer.Cannot share that."
    assert stored[0].structured_content == [
        {"type": "output_text", "text": "Visible answer."},
        {"type": "refusal", "refusal": "Cannot share that."},
    ]

    llm_messages = history.get_history()
    assert llm_messages == [
        {
            "role": "assistant",
            "content": [
                {"type": "output_text", "text": "Visible answer."},
                {"type": "refusal", "refusal": "Cannot share that."},
            ],
        }
    ]


def test_replace_with_entries_rehydrates_order_and_images():
    history = ConversationHistory()

    history.replace_with_entries(
        [
            {
                "role": "user",
                "content": "u1",
                "message_type": "user_query",
                "image_data": "img-1",
            },
            {
                "role": "tool",
                "content": "tool-1",
                "message_type": "tool_output",
                "image_data": "img-2",
            },
            {
                "role": "assistant",
                "content": "a1",
                "message_type": "assistant_response",
            },
        ]
    )

    stored = history.get_stored_messages()
    assert [msg.content for msg in stored] == ["u1", "tool-1", "a1"]
    assert stored[0].image_data == "img-1"
    assert stored[1].image_data == "img-2"


def test_replace_with_entries_preserves_structured_tool_content_for_llm_replay():
    history = ConversationHistory()

    history.replace_with_entries(
        [
            {
                "role": "tool",
                "content": [
                    {"type": "output_text", "text": "Tool said hello."},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,abc123"},
                    },
                ],
                "message_type": "tool_output",
                "tool_call_id": "call_1",
            },
        ]
    )

    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].content == "Tool said hello."
    assert stored[0].structured_content == [
        {"type": "output_text", "text": "Tool said hello."},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc123"}},
    ]
    assert history.get_history() == [
        {
            "role": "tool",
            "content": [
                {"type": "output_text", "text": "Tool said hello."},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,abc123"},
                },
            ],
            "tool_call_id": "call_1",
        }
    ]


def test_replace_with_entries_recovers_user_query_raw_and_compaction_facts():
    history = ConversationHistory()

    history.replace_with_entries(
        [
            {
                "role": "user",
                "content": "<system_context>state</system_context><user_query>summarize latest 5 emails</user_query>",
                "message_type": "user_query",
            },
            {
                "role": "tool",
                "content": "browser output",
                "message_type": "tool_output",
                "tool_name": "browser",
                "compaction_facts": {
                    "action": "snapshot",
                    "url": "https://outlook.office.com/mail/",
                },
            },
        ]
    )

    stored = history.get_stored_messages()
    assert stored[0].user_query_raw == "summarize latest 5 emails"
    assert stored[1].tool_name == "browser"
    assert stored[1].compaction_facts == {
        "action": "snapshot",
        "url": "https://outlook.office.com/mail/",
    }


def test_replace_with_entries_preserves_assistant_tool_call_rows():
    history = ConversationHistory()
    history.replace_with_entries(
        [
            {
                "role": "assistant",
                "content": "",
                "message_type": "assistant_response",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "name": "browser_navigate",
                        "arguments": {"url": "https://example.com"},
                    }
                ],
            },
            {
                "role": "tool",
                "content": "ok",
                "message_type": "tool_output",
                "tool_call_id": "call_1",
            },
        ]
    )

    llm_messages = history.get_history()
    assert llm_messages[0]["role"] == "assistant"
    assert llm_messages[0]["tool_calls"][0]["id"] == "call_1"
    assert llm_messages[1]["role"] == "tool"
    assert llm_messages[1]["tool_call_id"] == "call_1"

    normalized = LLMProvider._normalize_messages_for_provider(
        llm_messages,
        model="k2p5",
    )
    assert len(normalized) == 2
    assert normalized[0]["role"] == "assistant"
    assert normalized[1]["role"] == "tool"


def test_replace_with_entries_normalizes_structured_assistant_content():
    history = ConversationHistory()

    history.replace_with_entries(
        [
            {
                "role": "assistant",
                "content": [
                    {"type": "thinking", "text": "private reasoning"},
                    {"type": "output_text", "text": "Visible answer."},
                    {"type": "refusal", "refusal": "Cannot share that."},
                ],
                "message_type": "assistant_response",
            },
        ]
    )

    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].content == "Visible answer.Cannot share that."
    assert stored[0].structured_content == [
        {"type": "output_text", "text": "Visible answer."},
        {"type": "refusal", "refusal": "Cannot share that."},
    ]
    assert history.get_history() == [
        {
            "role": "assistant",
            "content": [
                {"type": "output_text", "text": "Visible answer."},
                {"type": "refusal", "refusal": "Cannot share that."},
            ],
        }
    ]


def test_replace_with_entries_drops_empty_assistant_rows_with_only_unsupported_content():
    history = ConversationHistory()

    history.replace_with_entries(
        [
            {
                "role": "assistant",
                "content": [
                    {"type": "thinking", "text": "private reasoning"},
                ],
                "message_type": "assistant_response",
            },
        ]
    )

    assert history.get_stored_messages() == []


def test_replace_with_stored_messages_replaces_history_atomically():
    history = ConversationHistory()
    history.add_user_message("old user")
    history.add_assistant_message("old assistant")

    replacement = [
        StoredMessage(
            role=MessageRole.ASSISTANT,
            content="compacted summary",
            message_type=MessageType.CONTEXT_COMPACTION,
        ),
        StoredMessage(
            role=MessageRole.USER,
            content="latest user",
            message_type=MessageType.USER_QUERY,
        ),
    ]

    history.replace_with_stored_messages(replacement)
    stored = history.get_stored_messages()
    assert len(stored) == 2
    assert stored[0].message_type == MessageType.CONTEXT_COMPACTION
    assert stored[1].content == "latest user"


def test_replace_with_entries_accepts_canonical_context_compaction_message_type():
    history = ConversationHistory()
    history.replace_with_entries(
        [
            {
                "role": "assistant",
                "content": "summary",
                "message_type": "context_compaction",
            }
        ]
    )

    stored = history.get_stored_messages()
    assert stored[0].message_type == MessageType.CONTEXT_COMPACTION


def test_replace_with_entries_rejects_old_message_type_aliases():
    history = ConversationHistory()

    with pytest.raises(ValueError, match="unsupported message_type"):
        history.replace_with_entries(
            [
                {
                    "role": "tool",
                    "content": "tool output",
                    "message_type": "tool-output",
                }
            ]
        )
