import litellm

from backend.src.services.token_service import TokenService


def test_count_tokens_falls_back_on_exception(monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(litellm, "token_counter", boom)
    messages = [
        {"role": "user", "content": "abcd"},
        {"role": "assistant", "content": [{"type": "text", "text": "abcdefgh"}]},
    ]
    assert TokenService.count_tokens(messages) == 3


def test_count_message_tokens_uses_count_tokens(monkeypatch):
    monkeypatch.setattr(
        TokenService,
        "count_tokens",
        staticmethod(lambda _messages, model="gpt-3.5-turbo": 7),
    )
    assert TokenService.count_message_tokens({"role": "user", "content": "hi"}) == 7
