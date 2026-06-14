"""Covers models config behavior in the backend test suite."""

from backend.src.llm.models.models_config import (
    LOCAL_VISION_MODELS,
    ONLINE_MODELS,
    ONLINE_THINKING_MODELS,
    THINKING_TEXT_STREAM_UNSUPPORTED_MODELS,
    resolve_provider_thinking_budget_tokens,
    resolve_provider_thinking_preference,
)


def test_online_model_lists_are_non_empty_and_unique_per_provider():
    assert ONLINE_MODELS
    for provider, models in ONLINE_MODELS.items():
        assert models, f"{provider} should have at least one model"
        model_ids = [str(model.get("id")) for model in models if isinstance(model, dict)]
        assert len(model_ids) == len(models), f"{provider} has non-dict model entries"
        assert len(model_ids) == len(set(model_ids)), f"{provider} has duplicate model ids"


def test_thinking_models_are_subsets_of_online_models():
    for provider, thinking_models in ONLINE_THINKING_MODELS.items():
        assert provider in ONLINE_MODELS
        online = {
            str(model.get("id"))
            for model in ONLINE_MODELS[provider]
            if isinstance(model, dict) and model.get("id")
        }
        assert set(thinking_models).issubset(online)


def test_unsupported_thinking_text_stream_models_are_subsets_of_thinking_models():
    for provider, unsupported in THINKING_TEXT_STREAM_UNSUPPORTED_MODELS.items():
        assert provider in ONLINE_THINKING_MODELS
        assert set(unsupported).issubset(set(ONLINE_THINKING_MODELS[provider]))


def test_expected_provider_defaults_exist_in_catalog():
    openrouter_model_ids = {
        str(model.get("id"))
        for model in ONLINE_MODELS["openrouter"]
        if isinstance(model, dict) and model.get("id")
    }
    kimi_model_ids = {
        str(model.get("id"))
        for model in ONLINE_MODELS["kimi-coding"]
        if isinstance(model, dict) and model.get("id")
    }
    assert "openrouter/auto" in openrouter_model_ids
    assert "qwen/qwen3-vl-235b-a22b-thinking" in openrouter_model_ids
    assert "k2p5" in kimi_model_ids


def test_local_vision_model_lists_are_non_empty_and_unique():
    assert LOCAL_VISION_MODELS
    for provider, models in LOCAL_VISION_MODELS.items():
        assert models, f"{provider} should expose at least one local vision model"
        assert len(models) == len(set(models))


def test_resolve_provider_thinking_preference_uses_preset_override():
    assert (
        resolve_provider_thinking_preference(
            model_id="openrouter/auto",
            provider_name="openrouter",
        )
        is False
    )


def test_resolve_provider_thinking_preference_matches_provider_thinking_catalog():
    assert (
        resolve_provider_thinking_preference(
            model_id="qwen/qwen3-vl-235b-a22b-thinking",
            provider_name="openrouter",
        )
        is True
    )


def test_resolve_provider_thinking_preference_returns_none_when_unknown():
    assert (
        resolve_provider_thinking_preference(
            model_id="nonexistent/model",
            provider_name="openrouter",
        )
        is None
    )


def test_resolve_provider_thinking_budget_tokens_uses_variant_budget_overrides():
    assert (
        resolve_provider_thinking_budget_tokens(
            model_id="claude-sonnet-4-5-20250929@@claude-sonnet-4-5-low-thinking",
            provider_name="anthropic",
        )
        == 4096
    )
    assert (
        resolve_provider_thinking_budget_tokens(
            model_id="gemini-3.1-pro-preview@@gemini-3-1-pro-high-thinking",
            provider_name="gemini",
        )
        == 32768
    )


def test_resolve_provider_thinking_budget_tokens_returns_none_for_medium_or_unknown_models():
    assert (
        resolve_provider_thinking_budget_tokens(
            model_id="gemini-3.1-pro-preview@@gemini-3-1-pro-thinking",
            provider_name="gemini",
        )
        is None
    )
    assert (
        resolve_provider_thinking_budget_tokens(
            model_id="nonexistent-model",
            provider_name="gemini",
        )
        is None
    )
