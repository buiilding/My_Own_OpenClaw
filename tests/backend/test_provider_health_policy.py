from types import SimpleNamespace

from backend.src.core.config.models import AppConfig
from backend.src.tools.provider_health import resolve_unavailable_agent_capabilities


def test_provider_health_reports_unavailable_ocr_vision_and_embeddings(monkeypatch):
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )
    ocr_router = SimpleNamespace(provider=object(), enabled=False)
    vision_router = SimpleNamespace(
        provider=object(),
        is_initialized=False,
        initialization_error="missing weights",
    )
    embedding_router = SimpleNamespace(provider=None)

    unavailable = resolve_unavailable_agent_capabilities(
        config,
        ocr_router=ocr_router,
        vision_router=vision_router,
        embedding_router=embedding_router,
    )

    assert unavailable == ["ocr", "vision", "embeddings", "web_search"]


def test_provider_health_keeps_available_capabilities(monkeypatch):
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-brave-key")
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )
    ocr_router = SimpleNamespace(provider=object(), enabled=True)
    vision_router = SimpleNamespace(
        provider=object(),
        is_initialized=True,
        initialization_error=None,
    )
    embedding_router = SimpleNamespace(provider=object())

    unavailable = resolve_unavailable_agent_capabilities(
        config,
        ocr_router=ocr_router,
        vision_router=vision_router,
        embedding_router=embedding_router,
    )

    assert unavailable == []


def test_provider_health_marks_ocr_unavailable_when_circuit_not_ready(monkeypatch):
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-brave-key")
    config = AppConfig(
        model_provider="anthropic",
        selected_model_id="claude-sonnet-4-20250514",
    )
    ocr_router = SimpleNamespace(provider=object(), enabled=True, is_ready=False)
    vision_router = SimpleNamespace(
        provider=object(),
        is_initialized=True,
        initialization_error=None,
    )
    embedding_router = SimpleNamespace(provider=object())

    unavailable = resolve_unavailable_agent_capabilities(
        config,
        ocr_router=ocr_router,
        vision_router=vision_router,
        embedding_router=embedding_router,
    )

    assert unavailable == ["ocr"]
