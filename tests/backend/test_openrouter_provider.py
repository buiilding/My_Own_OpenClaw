"""Tests for OpenRouter provider thinking-stream configuration."""

from backend.src.llm.providers.openrouter import OpenRouterProvider


def test_openrouter_provider_stream_includes_thinking_by_default():
    provider = OpenRouterProvider(api_key="test-key")
    assert provider.stream_includes_thinking is True


def test_openrouter_provider_enables_reasoning_payload_for_thinking_model():
    provider = OpenRouterProvider(api_key="test-key")
    params = {"model": "openrouter/qwen/qwen3-vl-235b-a22b-thinking"}

    updated = provider._apply_provider_request_params(
        params,
        model="qwen/qwen3-vl-235b-a22b-thinking",
    )

    assert updated.get("reasoning") == {"exclude": False}


def test_openrouter_provider_leaves_reasoning_unchanged_for_non_thinking_model():
    provider = OpenRouterProvider(api_key="test-key")
    params = {"model": "openrouter/auto"}

    updated = provider._apply_provider_request_params(
        params,
        model="auto",
    )

    assert "reasoning" not in updated
