import backend.src.services.token_service as token_service
from backend.src.agent.session.state import ConversationHistory
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.llm.providers.base import LLMProvider


def test_get_history_includes_system_prompt_and_messages():
    history = ConversationHistory(max_length=5, system_prompt="system prompt")

    history.add_user_message("hello")

    messages = history.get_history()
    assert messages[0] == {"role": "system", "content": "system prompt"}
    assert messages[1]["role"] == "user"
    assert messages[1]["content"] == "hello"


def test_prune_keeps_most_recent_messages():
    history = ConversationHistory(max_length=2)

    history.add_user_message("first")
    history.add_assistant_message("second")
    history.add_user_message("third")

    stored = history.get_stored_messages()
    assert len(stored) == 2
    assert stored[0].content == "second"
    assert stored[1].content == "third"


def test_preserves_all_images_in_history():
    history = ConversationHistory(max_length=10)

    history.add_user_message("one", image_data="img-1")
    history.add_tool_output("two", image_data="img-2")
    history.add_user_message("three", image_data="img-3")

    stored = history.get_stored_messages()
    assert stored[0].image_data == "img-1"
    assert stored[1].image_data == "img-2"
    assert stored[2].image_data == "img-3"

    llm_messages = history.get_history()
    assert isinstance(llm_messages[0]["content"], list)
    assert isinstance(llm_messages[1]["content"], list)
    assert isinstance(llm_messages[2]["content"], list)


def test_get_history_mutable_isolated_from_internal_cache():
    history = ConversationHistory(max_length=5)
    history.add_user_message("alpha")

    mutable = history.get_history_mutable()
    mutable[0]["content"] = "mutated"

    original = history.get_history()
    assert original[0]["content"] == "alpha"


def test_get_token_count_caches_per_model(monkeypatch):
    history = ConversationHistory(max_length=5)
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
    history = ConversationHistory(max_length=5)
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
    history = ConversationHistory(max_length=10)

    history.stage_tool_call_ids(["call_1"])
    history.add_tool_output("tool output")

    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].role == MessageRole.TOOL
    assert stored[0].content == "tool output"
    assert stored[0].tool_call_id == "call_1"

    llm_messages = history.get_history()
    assert len(llm_messages) == 1
    assert llm_messages[0]["role"] == "tool"
    assert llm_messages[0]["content"] == "tool output"


def test_tool_output_with_staged_tool_call_id_preserves_image_context_without_text_duplication():
    history = ConversationHistory(max_length=10)

    history.stage_tool_call_ids(["call_1"])
    history.add_tool_output("tool output", image_data="img-1")

    stored = history.get_stored_messages()
    assert len(stored) == 1
    assert stored[0].role == MessageRole.TOOL
    assert stored[0].content == "tool output"
    assert stored[0].tool_call_id == "call_1"
    assert stored[0].image_data == "img-1"

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
    history = ConversationHistory(max_length=10)
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


def test_prune_invalidates_token_cache(monkeypatch):
    history = ConversationHistory(max_length=1)
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
    assert history.get_token_count("model-a") == 7
    assert service.count_tokens_calls == 2


def test_replace_with_entries_rehydrates_order_and_images():
    history = ConversationHistory(max_length=10)

    history.replace_with_entries(
        [
            {
                "role": "user",
                "content": "u1",
                "message_type": "user",
                "image_data": "img-1",
            },
            {
                "role": "tool",
                "content": "tool-1",
                "message_type": "tool-output",
                "image_data": "img-2",
            },
            {
                "role": "assistant",
                "content": "a1",
                "message_type": "llm-text",
            },
        ]
    )

    stored = history.get_stored_messages()
    assert [msg.content for msg in stored] == ["u1", "tool-1", "a1"]
    assert stored[0].image_data == "img-1"
    assert stored[1].image_data == "img-2"


def test_replace_with_entries_preserves_assistant_tool_call_rows():
    history = ConversationHistory(max_length=10)
    history.replace_with_entries(
        [
            {
                "role": "assistant",
                "content": "",
                "message_type": "tool-call",
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
                "message_type": "tool-output",
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


def test_replace_with_stored_messages_replaces_history_atomically():
    history = ConversationHistory(max_length=10)
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


def test_replace_with_entries_normalizes_context_compaction_message_type():
    history = ConversationHistory(max_length=10)
    history.replace_with_entries(
        [
            {
                "role": "assistant",
                "content": "summary",
                "message_type": "context-compaction",
            }
        ]
    )

    stored = history.get_stored_messages()
    assert stored[0].message_type == MessageType.CONTEXT_COMPACTION
