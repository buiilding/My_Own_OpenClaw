"""Covers provider native reasoning behavior in the backend test suite."""

from backend.src.llm.providers.provider_native_reasoning import (
    DEFAULT_NATIVE_THINKING_TOKEN_BUDGET,
    apply_provider_native_thinking_request_params,
)


def test_apply_provider_native_thinking_request_params_enables_thinking_for_supported_model():
    params = {"model": "anthropic/claude-sonnet-4-5-20250929"}

    updated = apply_provider_native_thinking_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-thinking",
        provider_name="anthropic",
    )

    assert updated["thinking"] == {
        "type": "enabled",
        "budget_tokens": DEFAULT_NATIVE_THINKING_TOKEN_BUDGET,
    }


def test_apply_provider_native_thinking_request_params_removes_thinking_for_non_thinking_model():
    params = {
        "model": "gemini/gemini-3.1-pro-preview",
        "thinking": {"type": "enabled", "budget_tokens": 1000},
    }

    updated = apply_provider_native_thinking_request_params(
        params,
        model="gemini-3.1-pro-preview@@gemini-3-1-pro-nonthinking",
        provider_name="gemini",
    )

    assert "thinking" not in updated


def test_apply_provider_native_thinking_request_params_uses_low_budget_variant_override():
    params = {"model": "anthropic/claude-sonnet-4-5-20250929"}

    updated = apply_provider_native_thinking_request_params(
        params,
        model="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-low-thinking",
        provider_name="anthropic",
    )

    assert updated["thinking"] == {"type": "enabled", "budget_tokens": 4096}


def test_apply_provider_native_thinking_request_params_uses_high_budget_variant_override():
    params = {"model": "gemini/gemini-3.1-pro-preview"}

    updated = apply_provider_native_thinking_request_params(
        params,
        model="gemini-3.1-pro-preview@@gemini-3-1-pro-high-thinking",
        provider_name="gemini",
    )

    assert updated["thinking"] == {"type": "enabled", "budget_tokens": 32768}
