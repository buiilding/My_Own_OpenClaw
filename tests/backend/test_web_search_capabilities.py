import pytest

from backend.src.core.config.models import AppConfig
from backend.src.tools.web_search.capabilities import (
    resolve_web_search_execution_mode,
    should_enable_native_web_search,
    should_expose_backend_web_search_tool,
)


def test_web_search_capabilities_prefer_openai_native_support(monkeypatch):
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    config = AppConfig(
        model_provider="openai",
        selected_model_id="gpt-5@@gpt-5-nonthinking",
    )

    assert resolve_web_search_execution_mode(config) == "native-openai"
    assert should_enable_native_web_search(config) is True
    assert should_expose_backend_web_search_tool(config) is True


def test_web_search_capabilities_enable_gemini_native_support(monkeypatch):
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    config = AppConfig(
        model_provider="gemini",
        selected_model_id="gemini-3.1-pro-preview@@gemini-3-1-pro-thinking",
    )

    assert resolve_web_search_execution_mode(config) == "native-gemini"
    assert should_enable_native_web_search(config) is True
    assert should_expose_backend_web_search_tool(config) is True


def test_web_search_capabilities_fall_back_to_brave_for_other_providers(monkeypatch):
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-brave-key")
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )

    assert resolve_web_search_execution_mode(config) == "backend-brave"
    assert should_enable_native_web_search(config) is False
    assert should_expose_backend_web_search_tool(config) is True


def test_web_search_capabilities_disable_web_search_without_native_support_or_brave_key(monkeypatch):
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )

    assert resolve_web_search_execution_mode(config) is None
    assert should_enable_native_web_search(config) is False
    assert should_expose_backend_web_search_tool(config) is False
