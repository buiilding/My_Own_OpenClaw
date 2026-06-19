"""Covers provider factory helpers behavior in the backend test suite."""

import pytest

import backend.src.llm.providers.factory as providers_module
from backend.src.core.config.models import (
    AppConfig,
    KimiCodingConfig,
    LLMProviders,
    LMStudioConfig,
    OllamaConfig,
    OpenRouterConfig,
)


class FakeProvider:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def _patch_factory_provider_classes(monkeypatch):
    providers_module._create_cached_provider_factory.cache_clear()
    for provider_class in (
        "OpenAIProvider",
        "GeminiProvider",
        "AnthropicProvider",
        "OpenRouterProvider",
        "MistralProvider",
        "KimiCodingProvider",
        "ScriptedProvider",
        "OllamaProvider",
        "LMStudioProvider",
    ):
        monkeypatch.setattr(providers_module, provider_class, FakeProvider)


def test_normalize_base_url_strips_whitespace_and_trailing_slash():
    normalized = providers_module._normalize_base_url(
        "  http://localhost:11434/v1/  ",
        "http://localhost:11434/v1",
    )
    assert normalized == "http://localhost:11434/v1"
    assert (
        providers_module._normalize_base_url("", "http://default") == "http://default"
    )
    assert (
        providers_module._normalize_base_url("/", "http://default") == "http://default"
    )


def test_normalize_provider_name_accepts_current_kimi_forms_only():
    assert providers_module._normalize_provider_name(" kimi-coding ") == "kimi-coding"
    assert providers_module._normalize_provider_name("kimi_coding") == "kimi-coding"
    assert providers_module._normalize_provider_name(" KIMI_CODE ") == "kimi_code"
    assert providers_module._normalize_provider_name("kimi-code") == "kimi-code"
    assert providers_module._normalize_provider_name("kimi code") == "kimi code"
    assert providers_module._normalize_provider_name("OpenAI") == "openai"


def test_safe_timeout_conversion_enforces_limits_and_defaults():
    assert providers_module._safe_timeout_conversion("5") == 5.0
    assert providers_module._safe_timeout_conversion(0.25, default=9.0) == 9.0
    assert providers_module._safe_timeout_conversion(999999) == 3600.0
    assert providers_module._safe_timeout_conversion("bad", default=12.0) == 12.0
    assert providers_module._safe_timeout_conversion(float("nan"), default=7.0) == 7.0
    assert providers_module._safe_timeout_conversion(float("inf"), default=7.0) == 7.0


def test_canonicalize_provider_urls_normalizes_values():
    cfg = AppConfig(
        llm_providers=LLMProviders(
            ollama=OllamaConfig(base_url=" http://ollama:11434/v1/ "),
            lmstudio=LMStudioConfig(base_url="http://lmstudio:1234/v1/"),
            openrouter=OpenRouterConfig(base_url=" https://openrouter.ai/api/v1/ "),
            kimi_coding=KimiCodingConfig(base_url=" https://api.kimi.com/coding/v1/ "),
        )
    )

    assert providers_module._canonicalize_provider_urls(cfg) == (
        "http://ollama:11434/v1",
        "http://lmstudio:1234/v1",
        "https://openrouter.ai/api/v1",
        "https://api.kimi.com/coding",
    )


def test_create_provider_factory_cache_key_ignores_url_trailing_slash(monkeypatch):
    _patch_factory_provider_classes(monkeypatch)

    cfg_with_slash = AppConfig(
        api_key="k",
        llm_timeout=30,
        llm_providers=LLMProviders(
            ollama=OllamaConfig(base_url="http://localhost:11434/v1/"),
            lmstudio=LMStudioConfig(base_url="http://localhost:1234/v1/"),
            openrouter=OpenRouterConfig(base_url="https://openrouter.ai/api/v1/"),
            kimi_coding=KimiCodingConfig(base_url="https://api.kimi.com/coding/v1/"),
        ),
    )
    cfg_without_slash = AppConfig(
        api_key="k",
        llm_timeout=30,
        llm_providers=LLMProviders(
            ollama=OllamaConfig(base_url="http://localhost:11434/v1"),
            lmstudio=LMStudioConfig(base_url="http://localhost:1234/v1"),
            openrouter=OpenRouterConfig(base_url="https://openrouter.ai/api/v1"),
            kimi_coding=KimiCodingConfig(base_url="https://api.kimi.com/coding/v1"),
        ),
    )

    first_factory = providers_module.create_provider_factory(cfg_with_slash)
    second_factory = providers_module.create_provider_factory(cfg_without_slash)

    assert first_factory is second_factory
    assert first_factory["ollama"].kwargs["base_url"] == "http://localhost:11434/v1"
    assert first_factory["lmstudio"].kwargs["base_url"] == "http://localhost:1234/v1"


def test_create_provider_factory_cache_key_normalizes_kimi_v1_suffix(monkeypatch):
    _patch_factory_provider_classes(monkeypatch)

    cfg_with_v1 = AppConfig(
        api_key="k",
        llm_timeout=30,
        llm_providers=LLMProviders(
            kimi_coding=KimiCodingConfig(base_url="https://api.kimi.com/coding/v1"),
        ),
    )
    cfg_without_v1 = AppConfig(
        api_key="k",
        llm_timeout=30,
        llm_providers=LLMProviders(
            kimi_coding=KimiCodingConfig(base_url="https://api.kimi.com/coding"),
        ),
    )

    first_factory = providers_module.create_provider_factory(cfg_with_v1)
    second_factory = providers_module.create_provider_factory(cfg_without_v1)

    assert first_factory is second_factory
    assert (
        first_factory["kimi-coding"].kwargs["base_url"] == "https://api.kimi.com/coding"
    )


def test_get_provider_accepts_current_kimi_provider_key(monkeypatch):
    kimi_provider = object()
    monkeypatch.setattr(
        providers_module,
        "create_provider_factory",
        lambda _cfg: {"kimi-coding": kimi_provider},
    )

    provider = providers_module.get_provider(AppConfig(), "kimi-coding")

    assert provider is kimi_provider


@pytest.mark.parametrize("provider_name", ["kimi_code", "kimi-code"])
def test_get_provider_rejects_unknown_kimi_spellings_without_dedicated_alias_path(
    monkeypatch,
    provider_name,
):
    kimi_provider = object()
    monkeypatch.setattr(
        providers_module,
        "create_provider_factory",
        lambda _cfg: {"kimi-coding": kimi_provider},
    )

    with pytest.raises(ValueError, match=provider_name):
        providers_module.get_provider(AppConfig(), provider_name)


def test_get_provider_rejects_space_separated_provider_name(monkeypatch):
    kimi_provider = object()
    monkeypatch.setattr(
        providers_module,
        "create_provider_factory",
        lambda _cfg: {"kimi-coding": kimi_provider},
    )

    with pytest.raises(ValueError, match="kimi code"):
        providers_module.get_provider(AppConfig(), "kimi code")


def test_get_provider_routes_scripted_provider_without_api_key():
    providers_module._create_cached_provider_factory.cache_clear()

    provider = providers_module.get_provider(AppConfig(api_key=None), "scripted")

    assert provider.__class__.__name__ == "ScriptedProvider"
