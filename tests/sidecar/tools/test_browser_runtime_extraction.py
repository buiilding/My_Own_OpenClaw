"""Unit tests for browser runtime extraction helper module."""

from __future__ import annotations

from types import ModuleType, SimpleNamespace
from unittest import mock

import pytest

from tools.browser.browser_runtime_extraction import (
    OPENAI_COMPAT_EXTRACTION_DEFAULT_BASE_URLS,
    build_windie_extraction_llm,
    ensure_extraction_feature_pack_available,
    get_extraction_feature_pack,
    normalize_provider_name,
    resolve_windie_extraction_target,
)


class FakeChatModel:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def _runtime_config(
    *,
    model_provider: str | None,
    selected_model_id: str | None,
    api_key: str | None = None,
    provider_config: object | None = None,
):
    llm_providers = SimpleNamespace(
        get_provider_config=mock.Mock(return_value=provider_config),
    )
    return SimpleNamespace(
        model_provider=model_provider,
        selected_model_id=selected_model_id,
        api_key=api_key,
        llm_providers=llm_providers,
    )


def test_normalize_provider_name_maps_aliases():
    assert normalize_provider_name(None) is None
    assert normalize_provider_name("  ") is None
    assert normalize_provider_name("kimi-code") == "kimi_coding"
    assert normalize_provider_name("gemini") == "google"
    assert normalize_provider_name("OpenRouter") == "openrouter"


def test_get_extraction_feature_pack_maps_supported_providers():
    assert get_extraction_feature_pack("openai") == "browser_llm_openai"
    assert get_extraction_feature_pack("openrouter") == "browser_llm_openai"
    assert get_extraction_feature_pack("google") == "browser_llm_google"
    assert get_extraction_feature_pack("mistral") is None


def test_resolve_windie_extraction_target_uses_env_when_loader_unavailable():
    with mock.patch.dict(
        "os.environ",
        {
            "WINDIE_BROWSER_USE_EXTRACTION_PROVIDER": "openai",
            "WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID": "gpt-5.1",
            "WINDIE_BROWSER_USE_EXTRACTION_API_KEY": "env-api-key",
            "WINDIE_BROWSER_USE_EXTRACTION_BASE_URL": "https://api.example/v1",
        },
        clear=False,
    ):
        provider, model_id, api_key, base_url = resolve_windie_extraction_target(
            lambda _name: (_ for _ in ()).throw(ImportError("loader unavailable")),
            provider_env="WINDIE_BROWSER_USE_EXTRACTION_PROVIDER",
            model_id_env="WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID",
            api_key_env="WINDIE_BROWSER_USE_EXTRACTION_API_KEY",
            base_url_env="WINDIE_BROWSER_USE_EXTRACTION_BASE_URL",
        )

    assert provider == "openai"
    assert model_id == "gpt-5.1"
    assert api_key == "env-api-key"
    assert base_url == "https://api.example/v1"


def test_resolve_windie_extraction_target_falls_back_to_runtime_settings():
    provider_config = SimpleNamespace(
        base_url="https://runtime-provider.example/v1",
        api_key_env="RUNTIME_PROVIDER_API_KEY",
    )
    runtime_config = _runtime_config(
        model_provider="google",
        selected_model_id="gemini-2.5-pro",
        api_key="runtime-api-key",
        provider_config=provider_config,
    )

    loader_module = ModuleType("backend.src.core.config.loader")
    loader_module.load_settings_from_file = mock.Mock(return_value=runtime_config)

    def import_module(name: str):
        if name == "backend.src.core.config.loader":
            return loader_module
        raise ImportError(name)

    with mock.patch.dict("os.environ", {}, clear=False):
        provider, model_id, api_key, base_url = resolve_windie_extraction_target(
            import_module,
            provider_env="WINDIE_BROWSER_USE_EXTRACTION_PROVIDER",
            model_id_env="WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID",
            api_key_env="WINDIE_BROWSER_USE_EXTRACTION_API_KEY",
            base_url_env="WINDIE_BROWSER_USE_EXTRACTION_BASE_URL",
        )

    assert provider == "google"
    assert model_id == "gemini-2.5-pro"
    assert api_key == "runtime-api-key"
    assert base_url == "https://runtime-provider.example/v1"


def test_resolve_windie_extraction_target_retries_loader_after_import_failure():
    runtime_config = _runtime_config(
        model_provider="openai",
        selected_model_id="gpt-5.1",
        api_key="runtime-openai-key",
        provider_config=SimpleNamespace(base_url=None, api_key_env="OPENAI_API_KEY"),
    )

    loader_module = ModuleType("backend.src.core.config.loader")
    loader_module.load_settings_from_file = mock.Mock(return_value=runtime_config)
    attempts = {"count": 0}

    def import_module(name: str):
        if name != "backend.src.core.config.loader":
            raise ImportError(name)
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise ImportError("backend loader missing on initial sys.path")
        return loader_module

    with mock.patch.dict("os.environ", {}, clear=False):
        provider, model_id, api_key, base_url = resolve_windie_extraction_target(
            import_module,
            provider_env="WINDIE_BROWSER_USE_EXTRACTION_PROVIDER",
            model_id_env="WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID",
            api_key_env="WINDIE_BROWSER_USE_EXTRACTION_API_KEY",
            base_url_env="WINDIE_BROWSER_USE_EXTRACTION_BASE_URL",
        )

    assert attempts["count"] == 2
    assert provider == "openai"
    assert model_id == "gpt-5.1"
    assert api_key == "runtime-openai-key"
    assert base_url is None


def test_build_windie_extraction_llm_openrouter_uses_default_base_url():
    openai_module = ModuleType("browser_use.llm.openai.chat")
    openai_module.ChatOpenAI = FakeChatModel

    def import_module(name: str):
        if name == "browser_use.llm.openai.chat":
            return openai_module
        raise ImportError(name)

    llm, error = build_windie_extraction_llm(
        import_module,
        provider_name="openrouter",
        model_id="openai/gpt-4.1-mini",
        api_key="test-key",
        base_url=None,
    )

    assert error is None
    assert llm.kwargs == {
        "model": "openai/gpt-4.1-mini",
        "api_key": "test-key",
        "base_url": OPENAI_COMPAT_EXTRACTION_DEFAULT_BASE_URLS["openrouter"],
    }


def test_build_windie_extraction_llm_unknown_provider_returns_error():
    llm, error = build_windie_extraction_llm(
        lambda _name: None,
        provider_name="unknown_provider",
        model_id="unknown-model",
        api_key=None,
        base_url=None,
    )

    assert llm is None
    assert "unknown_provider" in (error or "")


def test_ensure_extraction_feature_pack_available_returns_none_for_unmapped_provider():
    assert ensure_extraction_feature_pack_available("mistral") is None


def test_ensure_extraction_feature_pack_available_success_path(monkeypatch):
    state = {"available": False}

    monkeypatch.setattr(
        "tools.browser.browser_runtime_extraction.ensure_feature_pack_site_packages_on_path",
        lambda: None,
    )
    monkeypatch.setattr(
        "tools.browser.browser_runtime_extraction.is_feature_pack_available",
        lambda pack: state["available"] if pack == "browser_llm_openai" else False,
    )

    def _install_feature_pack(pack: str):
        assert pack == "browser_llm_openai"
        state["available"] = True
        return True, None

    monkeypatch.setattr(
        "tools.browser.browser_runtime_extraction.install_feature_pack",
        _install_feature_pack,
    )

    assert ensure_extraction_feature_pack_available("openai") is None


def test_ensure_extraction_feature_pack_available_failure_includes_manual_command(monkeypatch):
    monkeypatch.setattr(
        "tools.browser.browser_runtime_extraction.ensure_feature_pack_site_packages_on_path",
        lambda: None,
    )
    monkeypatch.setattr(
        "tools.browser.browser_runtime_extraction.is_feature_pack_available",
        lambda _pack: False,
    )
    monkeypatch.setattr(
        "tools.browser.browser_runtime_extraction.install_feature_pack",
        lambda _pack: (False, "network down"),
    )
    monkeypatch.setattr(
        "tools.browser.browser_runtime_extraction.build_feature_pack_manual_install_message",
        lambda _pack: "manual pip command",
    )

    error = ensure_extraction_feature_pack_available("google")

    assert isinstance(error, str)
    assert "browser_llm_google" in error
    assert "network down" in error
    assert "manual pip command" in error
