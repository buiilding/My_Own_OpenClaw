"""Tests for Anthropic provider thinking configuration behavior."""

from backend.src.llm.providers.anthropic import AnthropicProvider


def test_anthropic_provider_stream_includes_thinking_by_default():
    provider = AnthropicProvider(api_key="test-key")
    assert provider.stream_includes_thinking is True


def test_anthropic_provider_enables_thinking_payload_for_thinking_model():
    provider = AnthropicProvider(api_key="test-key")
    params = {"model": "anthropic/claude-sonnet-4-5-20250929"}

    updated = provider._apply_provider_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-thinking",
    )

    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 16384}


def test_anthropic_provider_removes_thinking_payload_for_non_thinking_model():
    provider = AnthropicProvider(api_key="test-key")
    params = {
        "model": "anthropic/claude-sonnet-4-5-20250929",
        "thinking": {"type": "enabled", "budget_tokens": 16384},
    }

    updated = provider._apply_provider_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-nonthinking",
    )

    assert "thinking" not in updated


def test_anthropic_provider_keeps_existing_thinking_payload_when_model_is_unknown():
    provider = AnthropicProvider(api_key="test-key")
    params = {
        "model": "anthropic/custom-model",
        "thinking": {"type": "enabled", "budget_tokens": 1000},
    }

    updated = provider._apply_provider_request_params(
        params,
        model="custom-model",
    )

    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 1000}


def test_anthropic_provider_extracts_provider_native_thinking_blocks():
    provider = AnthropicProvider(api_key="test-key")

    delta = {
        "content": [
            {"type": "text", "text": "visible assistant text"},
            {"type": "thinking_delta", "text": "provider-native thought"},
        ]
    }

    assert provider._extract_thinking_content(delta) == "provider-native thought"


def test_anthropic_provider_uses_low_budget_for_low_reasoning_variant():
    provider = AnthropicProvider(api_key="test-key")
    params = {"model": "anthropic/claude-sonnet-4-5-20250929"}

    updated = provider._apply_provider_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-low-thinking",
    )

    assert updated.get("thinking") == {"type": "enabled", "budget_tokens": 4096}
