import backend.src.services.token_service as token_service
from backend.src.agent.session.state import ConversationHistory


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


def test_trim_old_images_keeps_last_two():
    history = ConversationHistory(max_length=10)

    history.add_user_message("one", image_data="img-1")
    history.add_tool_output("two", image_data="img-2")
    history.add_user_message("three", image_data="img-3")

    stored = history.get_stored_messages()
    assert stored[0].image_data is None
    assert stored[1].image_data == "img-2"
    assert stored[2].image_data == "img-3"

    llm_messages = history.get_history()
    assert isinstance(llm_messages[0]["content"], str)
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
    history.set_image_trimming_enabled(False)

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
