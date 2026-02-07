from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import threading

import litellm

import backend.src.services.token_service as token_service_module
from backend.src.services.token_service import TokenService


@dataclass
class MessageObj:
    role: str
    content: object


def test_count_tokens_falls_back_on_exception(monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(litellm, "token_counter", boom)
    messages = [
        {"role": "user", "content": "abcd"},
        {"role": "assistant", "content": [{"type": "text", "text": "abcdefgh"}]},
    ]
    assert TokenService.count_tokens(messages) == 3


def test_count_tokens_fallback_handles_object_messages(monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(litellm, "token_counter", boom)
    messages = [
        {"role": "user", "content": "abcd"},
        MessageObj(
            role="assistant",
            content=[
                {"type": "text", "text": "abcdefgh"},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
            ],
        ),
    ]
    assert TokenService.count_tokens(messages) == 3


def test_count_tokens_empty_messages_short_circuit(monkeypatch):
    called = {"value": False}

    def fake_counter(*_args, **_kwargs):
        called["value"] = True
        return 123

    monkeypatch.setattr(litellm, "token_counter", fake_counter)

    assert TokenService.count_tokens([]) == 0
    assert called["value"] is False


def test_count_tokens_normalizes_object_message_for_litellm(monkeypatch):
    captured = {}

    def fake_counter(*, model, messages, use_default_image_token_count):
        captured["model"] = model
        captured["messages"] = messages
        captured["use_default_image_token_count"] = use_default_image_token_count
        return 5

    monkeypatch.setattr(litellm, "token_counter", fake_counter)

    token_count = TokenService.count_tokens(
        [MessageObj(role="assistant", content="hello world")],
        model="gpt-4o",
    )

    assert token_count == 5
    assert captured["model"] == "gpt-4o"
    assert captured["use_default_image_token_count"] is True
    assert captured["messages"] == [{"role": "assistant", "content": "hello world"}]


def test_count_tokens_normalizes_partial_dict_without_mutating_input(monkeypatch):
    captured = {}

    def fake_counter(*, model, messages, use_default_image_token_count):
        captured["messages"] = messages
        return 3

    monkeypatch.setattr(litellm, "token_counter", fake_counter)
    original = {"content": "hello"}

    result = TokenService.count_tokens([original], model="gpt-4o-mini")

    assert result == 3
    assert original == {"content": "hello"}
    assert captured["messages"] == [{"role": "user", "content": "hello"}]
    assert captured["messages"][0] is not original


def test_get_token_service_singleton_thread_safe(monkeypatch):
    creation_count = {"value": 0}
    barrier = threading.Barrier(16)

    class FakeTokenService:
        def __init__(self):
            creation_count["value"] += 1

    monkeypatch.setattr(token_service_module, "TokenService", FakeTokenService)
    monkeypatch.setattr(token_service_module, "_token_service", None)

    def resolve_service():
        barrier.wait(timeout=5)
        return token_service_module.get_token_service()

    with ThreadPoolExecutor(max_workers=16) as executor:
        services = list(executor.map(lambda _: resolve_service(), range(16)))

    assert creation_count["value"] == 1
    assert len({id(service) for service in services}) == 1


def test_count_message_tokens_uses_count_tokens(monkeypatch):
    monkeypatch.setattr(
        TokenService,
        "count_tokens",
        staticmethod(lambda _messages, model="gpt-3.5-turbo": 7),
    )
    assert TokenService.count_message_tokens({"role": "user", "content": "hi"}) == 7
