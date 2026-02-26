from backend.src.llm.models.models_config import (
    LOCAL_VISION_MODELS,
    ONLINE_MODELS,
    ONLINE_THINKING_MODELS,
    THINKING_TEXT_STREAM_UNSUPPORTED_MODELS,
)


def test_online_model_lists_are_non_empty_and_unique_per_provider():
    assert ONLINE_MODELS
    for provider, models in ONLINE_MODELS.items():
        assert models, f"{provider} should have at least one model"
        assert len(models) == len(set(models)), f"{provider} has duplicate model ids"


def test_thinking_models_are_subsets_of_online_models():
    for provider, thinking_models in ONLINE_THINKING_MODELS.items():
        assert provider in ONLINE_MODELS
        online = set(ONLINE_MODELS[provider])
        assert set(thinking_models).issubset(online)


def test_unsupported_thinking_text_stream_models_are_subsets_of_thinking_models():
    for provider, unsupported in THINKING_TEXT_STREAM_UNSUPPORTED_MODELS.items():
        assert provider in ONLINE_THINKING_MODELS
        assert set(unsupported).issubset(set(ONLINE_THINKING_MODELS[provider]))


def test_expected_provider_defaults_exist_in_catalog():
    assert "auto" in ONLINE_MODELS["openrouter"]
    assert "k2p5" in ONLINE_MODELS["kimi-coding"]


def test_local_vision_model_lists_are_non_empty_and_unique():
    assert LOCAL_VISION_MODELS
    for provider, models in LOCAL_VISION_MODELS.items():
        assert models, f"{provider} should expose at least one local vision model"
        assert len(models) == len(set(models))
